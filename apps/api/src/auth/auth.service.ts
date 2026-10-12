import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChangePasswordRequest,
  ContextOptionsResponse,
  LoginRequest,
  MeResponse,
  SessionContext,
  SetContextRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AccessService } from '../access/access.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './auth.types';
import {
  NO_CONTEXT,
  codeLabel,
  resolvePermissions,
  toMeResponse,
  userWithAccessInclude,
} from './auth.mapper';
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
    private readonly access: AccessService,
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

    // One accessible company (and one project in it) is selected automatically.
    const context = await this.defaultContext(this.access.forAssignments(user.roles));

    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt,
        lastSeenAt: now,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
        currentCompanyId: context.companyId,
        currentProjectId: context.projectId,
      },
    });

    return { token, me: toMeResponse(user, context) };
  }

  /** Returns the auth context for a session token, or null when it is missing, expired, revoked or the user is inactive. */
  async resolveSession(token: string | undefined): Promise<AuthContext | null> {
    if (token === undefined || token.length === 0) {
      return null;
    }

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: { include: userWithAccessInclude },
        currentCompany: true,
        currentProject: true,
      },
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

    // Assignments and role permissions come from the query above, which runs on EVERY request:
    // nothing about what the user may do is stored in the session row or cached between requests.
    const context: SessionContext = {
      companyId: session.currentCompany?.id ?? null,
      companyLabel:
        session.currentCompany === null
          ? null
          : codeLabel(session.currentCompany.code, session.currentCompany.legalName),
      projectId: session.currentProject?.id ?? null,
      projectLabel:
        session.currentProject === null
          ? null
          : codeLabel(session.currentProject.code, session.currentProject.name),
    };

    return {
      sessionId: session.id,
      user: toMeResponse(session.user, context),
      permissions: new Set(resolvePermissions(session.user)),
      access: this.access.forAssignments(session.user.roles),
    };
  }

  /** Active companies and projects the user may pick as working context. */
  async contextOptions(access: AccessContext): Promise<ContextOptionsResponse> {
    const [companyIds, projectIds] = await Promise.all([
      access.contextCompanyIds(),
      access.contextProjectIds(),
    ]);
    const [companies, projects] = await Promise.all([
      this.prisma.company.findMany({
        where: { isActive: true, ...(companyIds === null ? {} : { id: { in: companyIds } }) },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, legalName: true },
      }),
      this.prisma.project.findMany({
        where: { isActive: true, ...(projectIds === null ? {} : { id: { in: projectIds } }) },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true, companyId: true },
      }),
    ]);

    return {
      companies: companies.map((company) => ({
        id: company.id,
        label: codeLabel(company.code, company.legalName),
      })),
      projects: projects.map((project) => ({
        id: project.id,
        label: codeLabel(project.code, project.name),
        companyId: project.companyId,
      })),
    };
  }

  /**
   * Sets the session's working context. Not audited: it is session state, not business data.
   * A company change clears the project unless a project of the new company is sent with it.
   */
  async setContext(context: AuthContext, request: SetContextRequest): Promise<SessionContext> {
    const options = await this.contextOptions(context.access);
    const company =
      request.companyId === null
        ? null
        : (options.companies.find((option) => option.id === request.companyId) ?? null);

    if (request.companyId !== null && company === null) {
      throw this.contextNotAllowed();
    }

    const current = context.user.context;
    let projectId: string | null;

    if (request.companyId === null) {
      projectId = null;
    } else if (request.projectId === undefined) {
      projectId = request.companyId === current.companyId ? current.projectId : null;
    } else {
      projectId = request.projectId;
    }

    const project =
      projectId === null
        ? null
        : (options.projects.find((option) => option.id === projectId) ?? null);

    if (projectId !== null && (project === null || project.companyId !== request.companyId)) {
      throw this.contextNotAllowed();
    }

    await this.prisma.session.update({
      where: { id: context.sessionId },
      data: { currentCompanyId: request.companyId, currentProjectId: projectId },
    });

    return {
      companyId: company?.id ?? null,
      companyLabel: company?.label ?? null,
      projectId: project?.id ?? null,
      projectLabel: project?.label ?? null,
    };
  }

  /** Exactly one accessible company is selected; then exactly one accessible project in it. */
  private async defaultContext(access: AccessContext): Promise<SessionContext> {
    const options = await this.contextOptions(access);
    const [company] = options.companies.length === 1 ? options.companies : [];

    if (company === undefined) {
      return NO_CONTEXT;
    }

    const inCompany = options.projects.filter((project) => project.companyId === company.id);
    const [project] = inCompany.length === 1 ? inCompany : [];

    return {
      companyId: company.id,
      companyLabel: company.label,
      projectId: project?.id ?? null,
      projectLabel: project?.label ?? null,
    };
  }

  private contextNotAllowed(): ApiError {
    return new ApiError(
      HttpStatus.FORBIDDEN,
      'CONTEXT_NOT_ALLOWED',
      'That company or project is not available to you',
    );
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

    return toMeResponse({ ...user, mustChangePassword: false }, context.user.context);
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
