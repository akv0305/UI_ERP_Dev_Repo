import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ALL_PERMISSIONS } from '@uie/contracts';
import { ApiError } from '../common/errors/api-error';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService, hashToken, LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { PasswordService } from './password.service';

const META = { ipAddress: '10.0.0.1', userAgent: 'jest' };

interface FakeUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  roles: Array<{
    role: {
      code: string;
      name: string;
      isActive: boolean;
      permissions: Array<{ permissionCode: string }>;
    };
  }>;
}

function createPrismaMock() {
  return {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

async function setup() {
  const prisma = createPrismaMock();
  const passwords = new PasswordService();
  const config = { get: (key: string) => (key === 'SESSION_TTL_HOURS' ? 12 : undefined) };
  const rateLimiter = new LoginRateLimiter();
  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords,
    rateLimiter,
    config as unknown as ConfigService,
  );
  const passwordHash = await passwords.hash('Correct1pass');
  const user: FakeUser = {
    id: '0b0c1f5e-6c1f-4f5e-9d0a-1f1d3b5c7e9a',
    username: 'EMP001',
    email: 'emp@example.com',
    displayName: 'Employee One',
    passwordHash,
    isActive: true,
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    roles: [
      {
        role: {
          code: 'STORE_KEEPER',
          name: 'Store keeper',
          isActive: true,
          permissions: [{ permissionCode: 'stores.stock.view' }],
        },
      },
    ],
  };

  return { prisma, service, user, rateLimiter };
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  throw new Error('expected the promise to reject');
}

async function expectApiError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await errorOf(promise);

  expect(error.getResponse()).toMatchObject({ code });
}

describe('AuthService.login', () => {
  it('creates a session and returns the /me body on success', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue({ ...user, failedLoginCount: 3 });

    const result = await service.login({ identifier: 'emp001', password: 'Correct1pass' }, META);

    expect(result.me).toEqual({
      id: user.id,
      username: 'EMP001',
      email: 'emp@example.com',
      displayName: 'Employee One',
      mustChangePassword: false,
      roles: [{ code: 'STORE_KEEPER', name: 'Store keeper' }],
      permissions: ['stores.stock.view'],
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }) as unknown,
    });

    const sessionData = (
      prisma.session.create.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(sessionData.tokenHash).toBe(hashToken(result.token));
    expect(sessionData.tokenHash).not.toBe(result.token);
    expect(sessionData.userId).toBe(user.id);
  });

  it('matches case-insensitively on username or email', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue(user);

    await service.login({ identifier: 'EMP@Example.com', password: 'Correct1pass' }, META);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { username: { equals: 'EMP@Example.com', mode: 'insensitive' } },
            { email: { equals: 'EMP@Example.com', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('increments the failed count on a wrong password', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ failedLoginCount: 1 });

    await expectApiError(
      service.login({ identifier: 'EMP001', password: 'wrong' }, META),
      'INVALID_CREDENTIALS',
    );

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('locks the account for 15 minutes and resets the count at 5 failures', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue({ ...user, failedLoginCount: 4 });
    prisma.user.update.mockResolvedValueOnce({ failedLoginCount: MAX_FAILED_LOGINS });
    const before = Date.now();

    await expectApiError(
      service.login({ identifier: 'EMP001', password: 'wrong' }, META),
      'INVALID_CREDENTIALS',
    );

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    const lockCall = (
      prisma.user.update.mock.calls[1] as [
        { data: { failedLoginCount: number; lockedUntil: Date } },
      ]
    )[0];
    expect(lockCall.data.failedLoginCount).toBe(0);
    const lockedMs = lockCall.data.lockedUntil.getTime() - before;
    expect(lockedMs).toBeGreaterThanOrEqual(LOCKOUT_MINUTES * 60_000 - 1000);
    expect(lockedMs).toBeLessThanOrEqual(LOCKOUT_MINUTES * 60_000 + 5000);
  });

  it('rejects a locked account with ACCOUNT_LOCKED even with the right password', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue({
      ...user,
      lockedUntil: new Date(Date.now() + 5 * 60_000),
    });

    await expectApiError(
      service.login({ identifier: 'EMP001', password: 'Correct1pass' }, META),
      'ACCOUNT_LOCKED',
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('allows login again once the lock has expired', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue({ ...user, lockedUntil: new Date(Date.now() - 1000) });

    const result = await service.login({ identifier: 'EMP001', password: 'Correct1pass' }, META);

    expect(result.me.username).toBe('EMP001');
  });

  it('returns the same error code for an unknown user and a wrong password', async () => {
    const { prisma, service, user } = await setup();

    prisma.user.findFirst.mockResolvedValueOnce(null);
    const unknown = await errorOf(
      service.login({ identifier: 'nobody', password: 'whatever1' }, META),
    );

    prisma.user.findFirst.mockResolvedValueOnce(user);
    prisma.user.update.mockResolvedValue({ failedLoginCount: 1 });
    const wrong = await errorOf(service.login({ identifier: 'EMP001', password: 'wrong' }, META));

    expect(unknown.getResponse()).toEqual(wrong.getResponse());
    expect(unknown.getStatus()).toBe(wrong.getStatus());
    expect(unknown.getResponse()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects an inactive user without creating a session', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findFirst.mockResolvedValue({ ...user, isActive: false });

    await expectApiError(
      service.login({ identifier: 'EMP001', password: 'Correct1pass' }, META),
      'INVALID_CREDENTIALS',
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rate limits to 10 attempts per minute per IP', async () => {
    const { prisma, service } = await setup();
    prisma.user.findFirst.mockResolvedValue(null);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expectApiError(
        service.login({ identifier: 'nobody', password: 'x' }, META),
        'INVALID_CREDENTIALS',
      );
    }

    await expectApiError(
      service.login({ identifier: 'nobody', password: 'x' }, META),
      'RATE_LIMITED',
    );
    await expectApiError(
      service.login({ identifier: 'nobody', password: 'x' }, { ...META, ipAddress: '10.0.0.2' }),
      'INVALID_CREDENTIALS',
    );
  });
});

describe('AuthService.resolveSession', () => {
  function sessionFor(user: FakeUser, overrides: Record<string, unknown> = {}) {
    return {
      id: 'session-1',
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      user,
      ...overrides,
    };
  }

  it('returns null without a token', async () => {
    const { service } = await setup();

    await expect(service.resolveSession(undefined)).resolves.toBeNull();
  });

  it('returns the context and updates lastSeenAt for a valid session', async () => {
    const { prisma, service, user } = await setup();
    prisma.session.findUnique.mockResolvedValue(sessionFor(user));

    const context = await service.resolveSession('token');

    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken('token') } }),
    );
    expect(context?.user.username).toBe('EMP001');
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastSeenAt: expect.any(Date) as unknown },
    });
  });

  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 1000) }],
    ['revoked', { revokedAt: new Date() }],
  ])('returns null for an %s session', async (_label, overrides) => {
    const { prisma, service, user } = await setup();
    prisma.session.findUnique.mockResolvedValue(sessionFor(user, overrides));

    await expect(service.resolveSession('token')).resolves.toBeNull();
  });

  it('returns null when the user is inactive', async () => {
    const { prisma, service, user } = await setup();
    prisma.session.findUnique.mockResolvedValue(sessionFor({ ...user, isActive: false }));

    await expect(service.resolveSession('token')).resolves.toBeNull();
  });

  it('gives ADMINISTRATOR every permission', async () => {
    const { prisma, service, user } = await setup();
    const admin: FakeUser = {
      ...user,
      roles: [
        { role: { code: 'ADMINISTRATOR', name: 'Administrator', isActive: true, permissions: [] } },
      ],
    };
    prisma.session.findUnique.mockResolvedValue(sessionFor(admin));

    const context = await service.resolveSession('token');

    expect(context?.user.permissions).toEqual([...ALL_PERMISSIONS]);
  });
});

describe('AuthService.changePassword', () => {
  const sessionContext = (id: string) =>
    ({ sessionId: 's1', user: { id }, permissions: new Set() }) as never;

  it('rejects a wrong current password', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findUnique.mockResolvedValue(user);

    await expectApiError(
      service.changePassword(sessionContext(user.id), {
        currentPassword: 'nope',
        newPassword: 'Newpass123',
      }),
      'INVALID_CURRENT_PASSWORD',
    );
  });

  it('stores a new hash, clears mustChangePassword and revokes other sessions', async () => {
    const { prisma, service, user } = await setup();
    prisma.user.findUnique.mockResolvedValue({ ...user, mustChangePassword: true });
    prisma.$transaction.mockResolvedValue([]);

    const me = await service.changePassword(sessionContext(user.id), {
      currentPassword: 'Correct1pass',
      newPassword: 'Newpass123',
    });

    expect(me.mustChangePassword).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: expect.objectContaining({
        mustChangePassword: false,
        passwordHash: expect.stringMatching(/^\$argon2id\$/) as unknown,
      }) as unknown,
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, id: { not: 's1' }, revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
