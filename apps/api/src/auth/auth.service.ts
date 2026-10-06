import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChangePasswordRequest, LoginRequest, MeResponse } from '@uie/contracts';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './auth.types';
import { resolvePermissions, toMeResponse, userWithAccessInclude } from './auth.mapper';
import { LoginRateLimiter } from './login-rate-limiter';
import { PasswordService } from './password.service';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LoginMeta {
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

export interface LoginResult {
  token: string;
  me: MeResponse;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly config: ConfigService,
  ) {}

  get sessionTtlHours(): number {
    return this.config.get<number>('SESSION_TTL_HOURS') ?? 12;
  }

  async login(request: LoginRequest, meta: LoginMeta): Promise<LoginResult> {
    if (!this.rateLimiter.consume(meta.ipAddress ?? 'unknown')) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many login attempts. Try again in a minute.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: request.identifier, mode: 'insensitive' } },
          { email: { equals: request.identifier, mode: 'insensitive' } },
        ],
      },
      include: userWithAccessInclude,
    });

    if (user === null) {
      // Spend comparable time so unknown identifiers are not distinguishable by latency.
      await this.passwords.verify(await this.getDummyHash(), request.password);
      throw this.invalidCredentials();
    }

    const now = new Date();

    if (user.lockedUntil !== null && user.lockedUntil > now) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_LOCKED',
        'Account is temporarily locked. Try again later.',
      );
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, request.password);

    if (!user.isActive) {
      throw this.invalidCredentials();
    }

    if (!passwordOk) {
      await this.registerFailedLogin(user.id, now);
      throw this.invalidCredentials();
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.sessionTtlHours * 3_600_000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt,
        lastSeenAt: now,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    });

    return { token, me: toMeResponse(user) };
  }

  /** Returns the auth context for a session token, or null when it is missing, expired, revoked or the user is inactive. */
  async resolveSession(token: string | undefined): Promise<AuthContext | null> {
    if (token === undefined || token.length === 0) {
      return null;
    }

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: userWithAccessInclude } },
    });

    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      !session.user.isActive
    ) {
      return null;
    }

    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });

    return {
      sessionId: session.id,
      user: toMeResponse(session.user),
      permissions: new Set(resolvePermissions(session.user)),
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(context: AuthContext, request: ChangePasswordRequest): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: context.user.id },
      include: userWithAccessInclude,
    });

    if (user === null) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Authentication required');
    }

    if (!(await this.passwords.verify(user.passwordHash, request.currentPassword))) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_CURRENT_PASSWORD',
        'Current password is incorrect',
      );
    }

    const passwordHash = await this.passwords.hash(request.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, updatedById: user.id },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, id: { not: context.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return toMeResponse({ ...user, mustChangePassword: false });
  }

  private async registerFailedLogin(userId: string, now: Date): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
        },
      });
    }
  }

  private invalidCredentials(): ApiError {
    return new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
