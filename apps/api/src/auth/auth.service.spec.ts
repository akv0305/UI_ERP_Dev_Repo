import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ALL_PERMISSIONS, type SessionContext } from '@uie/contracts';
import { ApiError } from '../common/errors/api-error';
import { AccessService } from '../access/access.service';
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
    id: string;
    roleId: string;
    scopeType: 'GLOBAL' | 'COMPANY' | 'PROJECT' | 'SITE';
    companyId: string | null;
    projectId: string | null;
    siteId: string | null;
    company: { id: string; code: string; legalName: string; isActive: boolean } | null;
    project: { id: string; code: string; name: string; isActive: boolean } | null;
    site: { id: string; code: string; name: string; isActive: boolean } | null;
    role: {
      id: string;
      code: string;
      name: string;
      isActive: boolean;
      permissions: Array<{ permissionCode: string }>;
    };
  }>;
}

function createPrismaMock() {
  const mock = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    company: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    site: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // No companies or projects exist unless a test says so.
  mock.company.findMany.mockResolvedValue([]);
  mock.project.findMany.mockResolvedValue([]);
  mock.site.findMany.mockResolvedValue([]);

  return mock;
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
    new AccessService(prisma as unknown as PrismaService),
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
        id: 'link-1',
        roleId: 'role-1',
        scopeType: 'GLOBAL',
        companyId: null,
        projectId: null,
        siteId: null,
        company: null,
        project: null,
        site: null,
        role: {
          id: 'role-1',
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
      assignments: [
        {
          id: expect.any(String) as unknown,
          roleId: expect.any(String) as unknown,
          roleCode: 'STORE_KEEPER',
          roleName: 'Store keeper',
          scopeType: 'GLOBAL',
          target: null,
        },
      ],
      context: { companyId: null, companyLabel: null, projectId: null, projectLabel: null },
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
      currentCompany: null,
      currentProject: null,
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
        {
          id: 'link-2',
          roleId: 'role-2',
          scopeType: 'GLOBAL',
          companyId: null,
          projectId: null,
          siteId: null,
          company: null,
          project: null,
          site: null,
          role: {
            id: 'role-2',
            code: 'ADMINISTRATOR',
            name: 'Administrator',
            isActive: true,
            permissions: [],
          },
        },
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

const COMPANY_A = {
  id: 'c0000000-0000-4000-8000-00000000000a',
  code: 'UIE',
  legalName: 'Unique Infra',
};
const COMPANY_B = {
  id: 'c0000000-0000-4000-8000-00000000000b',
  code: 'SPV1',
  legalName: 'Metro SPV',
};
const PROJECT_A1 = {
  id: 'd0000000-0000-4000-8000-0000000000a1',
  code: 'P001',
  name: 'Metro Line',
  companyId: COMPANY_A.id,
};
const PROJECT_A2 = {
  id: 'd0000000-0000-4000-8000-0000000000a2',
  code: 'P002',
  name: 'Bridge',
  companyId: COMPANY_A.id,
};
const PROJECT_B1 = {
  id: 'd0000000-0000-4000-8000-0000000000b1',
  code: 'P003',
  name: 'Tunnel',
  companyId: COMPANY_B.id,
};

function globalUser(user: FakeUser): FakeUser {
  return {
    ...user,
    roles: [
      {
        ...(user.roles[0] as FakeUser['roles'][number]),
        role: {
          id: 'role-2',
          code: 'ADMINISTRATOR',
          name: 'Administrator',
          isActive: true,
          permissions: [],
        },
      },
    ],
  };
}

function scopedUser(user: FakeUser, scope: Partial<FakeUser['roles'][number]>): FakeUser {
  return { ...user, roles: [{ ...(user.roles[0] as FakeUser['roles'][number]), ...scope }] };
}

function authFor(access: ReturnType<AccessService['forMapped']>, context = NO_SESSION_CONTEXT) {
  return {
    sessionId: 'session-1',
    user: { id: 'u1', context },
    permissions: new Set(),
    access,
  } as never;
}

const NO_SESSION_CONTEXT: SessionContext = {
  companyId: null,
  companyLabel: null,
  projectId: null,
  projectLabel: null,
};

describe('AuthService context on login', () => {
  async function loginAs(user: FakeUser, companies: unknown[], projects: unknown[]) {
    const { prisma, service } = await setup();
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.company.findMany.mockResolvedValue(companies);
    prisma.project.findMany.mockResolvedValue(projects);

    const result = await service.login({ identifier: 'emp001', password: 'Correct1pass' }, META);
    const data = (prisma.session.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

    return { result, data };
  }

  it('selects the only accessible company and its only project', async () => {
    const { user } = await setup();
    const { result, data } = await loginAs(globalUser(user), [COMPANY_A], [PROJECT_A1]);

    expect(data.currentCompanyId).toBe(COMPANY_A.id);
    expect(data.currentProjectId).toBe(PROJECT_A1.id);
    expect(result.me.context).toEqual({
      companyId: COMPANY_A.id,
      companyLabel: 'UIE — Unique Infra',
      projectId: PROJECT_A1.id,
      projectLabel: 'P001 — Metro Line',
    });
  });

  it('selects the company but not a project when it has several', async () => {
    const { user } = await setup();
    const { data } = await loginAs(globalUser(user), [COMPANY_A], [PROJECT_A1, PROJECT_A2]);

    expect(data.currentCompanyId).toBe(COMPANY_A.id);
    expect(data.currentProjectId).toBeNull();
  });

  it('selects nothing when several companies are accessible', async () => {
    const { user } = await setup();
    const { data } = await loginAs(
      globalUser(user),
      [COMPANY_A, COMPANY_B],
      [PROJECT_A1, PROJECT_B1],
    );

    expect(data.currentCompanyId).toBeNull();
    expect(data.currentProjectId).toBeNull();
  });
});

describe('AuthService.contextOptions', () => {
  it('restricts the queries to the companies and projects the user covers', async () => {
    const { prisma, service, user } = await setup();
    const access = new AccessService(prisma as unknown as PrismaService).forAssignments(
      scopedUser(user, {
        scopeType: 'COMPANY',
        companyId: COMPANY_A.id,
        role: { id: 'r', code: 'PM', name: 'PM', isActive: true, permissions: [] },
      }).roles as never,
    );
    prisma.project.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { companyId?: unknown; id?: unknown } }).where;

      return where.companyId === undefined ? [PROJECT_A1] : [{ id: PROJECT_A1.id }];
    });
    prisma.company.findMany.mockResolvedValue([COMPANY_A]);

    const options = await service.contextOptions(access);

    expect(options.companies).toEqual([{ id: COMPANY_A.id, label: 'UIE — Unique Infra' }]);
    expect(options.projects).toEqual([
      { id: PROJECT_A1.id, label: 'P001 — Metro Line', companyId: COMPANY_A.id },
    ]);
    const companyWhere = (
      prisma.company.findMany.mock.calls[0] as [{ where: Record<string, unknown> }]
    )[0].where;

    expect(companyWhere.isActive).toBe(true);
    expect(companyWhere.id).toEqual({ in: [COMPANY_A.id] });
  });

  it('does not filter ids for a GLOBAL holder but still lists only active records', async () => {
    const { prisma, service, user } = await setup();
    const access = new AccessService(prisma as unknown as PrismaService).forAssignments(
      globalUser(user).roles as never,
    );

    await service.contextOptions(access);

    const where = (prisma.project.findMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0]
      .where;

    expect(where).toEqual({ isActive: true });
  });
});

describe('AuthService.setContext', () => {
  async function withOptions(
    companies: unknown[],
    projects: unknown[],
    context = NO_SESSION_CONTEXT,
  ) {
    const { prisma, service, user } = await setup();
    prisma.company.findMany.mockResolvedValue(companies);
    prisma.project.findMany.mockResolvedValue(projects);
    const access = new AccessService(prisma as unknown as PrismaService).forAssignments(
      globalUser(user).roles as never,
    );

    return { prisma, service, auth: authFor(access as never, context) };
  }

  it('stores an allowed company and project on the session (and writes no audit)', async () => {
    const { prisma, service, auth } = await withOptions([COMPANY_A], [PROJECT_A1]);

    const result = await service.setContext(auth, {
      companyId: COMPANY_A.id,
      projectId: PROJECT_A1.id,
    });

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { currentCompanyId: COMPANY_A.id, currentProjectId: PROJECT_A1.id },
    });
    expect(result.projectLabel).toBe('P001 — Metro Line');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a company the user may not use with 403 CONTEXT_NOT_ALLOWED', async () => {
    const { service, auth } = await withOptions([COMPANY_A], [PROJECT_A1]);

    await expectApiError(
      service.setContext(auth, { companyId: COMPANY_B.id, projectId: null }),
      'CONTEXT_NOT_ALLOWED',
    );
  });

  it('rejects a project that belongs to another company', async () => {
    const { service, auth } = await withOptions([COMPANY_A, COMPANY_B], [PROJECT_A1, PROJECT_B1]);

    await expectApiError(
      service.setContext(auth, { companyId: COMPANY_A.id, projectId: PROJECT_B1.id }),
      'CONTEXT_NOT_ALLOWED',
    );
  });

  it('clears the project when the company changes and no project is sent', async () => {
    const { prisma, service, auth } = await withOptions(
      [COMPANY_A, COMPANY_B],
      [PROJECT_A1, PROJECT_B1],
      {
        companyId: COMPANY_A.id,
        companyLabel: 'x',
        projectId: PROJECT_A1.id,
        projectLabel: 'y',
      },
    );

    await service.setContext(auth, { companyId: COMPANY_B.id });

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { currentCompanyId: COMPANY_B.id, currentProjectId: null },
    });
  });

  it('keeps the project when only the company is re-sent unchanged', async () => {
    const { prisma, service, auth } = await withOptions([COMPANY_A], [PROJECT_A1], {
      companyId: COMPANY_A.id,
      companyLabel: 'x',
      projectId: PROJECT_A1.id,
      projectLabel: 'y',
    });

    await service.setContext(auth, { companyId: COMPANY_A.id });

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { currentCompanyId: COMPANY_A.id, currentProjectId: PROJECT_A1.id },
    });
  });

  it('a null company clears both', async () => {
    const { prisma, service, auth } = await withOptions([COMPANY_A], [PROJECT_A1]);

    await service.setContext(auth, { companyId: null, projectId: PROJECT_A1.id });

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { currentCompanyId: null, currentProjectId: null },
    });
  });
});

describe('AuthService.resolveSession re-reads permissions on every request', () => {
  it('queries the session with the assignments of the user each time and keeps nothing in the session row', async () => {
    const { prisma, service, user } = await setup();
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      user,
      currentCompany: null,
      currentProject: null,
    });

    const first = await service.resolveSession('token');
    // The role loses its permission between two requests: the next request must see that.
    (user.roles[0] as FakeUser['roles'][number]).role.permissions = [];
    const second = await service.resolveSession('token');

    expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: expect.objectContaining({ include: expect.anything() as unknown }) as unknown,
        }) as unknown,
      }),
    );
    expect(first?.permissions.has('stores.stock.view')).toBe(true);
    expect(second?.permissions.has('stores.stock.view')).toBe(false);
    // No permission data is written to the session row.
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastSeenAt: expect.any(Date) as unknown },
    });
  });
});
