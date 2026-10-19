import { jest } from '@jest/globals';
import { ApiError } from '../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import type { PasswordService } from '../auth/password.service';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const ADMIN_ROLE = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'ADMINISTRATOR',
  name: 'Administrator',
};
const OTHER_ROLE = { id: '22222222-2222-4222-8222-222222222222', code: 'CLERK', name: 'Clerk' };
const PM_ROLE = {
  id: '33333333-3333-4333-8333-333333333333',
  code: 'PROJECT_MANAGER',
  name: 'Project manager',
};
const USERS_ROLE = {
  id: '44444444-4444-4444-8444-444444444444',
  code: 'USER_CLERK',
  name: 'User clerk',
};
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMPANY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROJECT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SITE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

type Role = { id: string; code: string; name: string };

/** One role assignment row as the access query returns it. */
function link(
  role: Role,
  overrides: Record<string, unknown> = {},
  extra: { company?: unknown; project?: unknown; site?: unknown } = {},
) {
  return {
    id: `link-${role.code}-${String(overrides.scopeType ?? 'GLOBAL')}`,
    userId: TARGET_ID,
    roleId: role.id,
    scopeType: 'GLOBAL',
    companyId: null,
    projectId: null,
    siteId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdById: null,
    role,
    company: extra.company ?? null,
    project: extra.project ?? null,
    site: extra.site ?? null,
    ...overrides,
  };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    username: 'target',
    email: null,
    displayName: 'Target',
    isActive: true,
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    roles: [link(ADMIN_ROLE)],
    ...overrides,
  };
}

function global(roleId: string) {
  return { roleId, scopeType: 'GLOBAL' as const, companyId: null, projectId: null, siteId: null };
}

function roleRecord(role: Role, permissions: string[] = []) {
  return { ...role, permissions: permissions.map((permissionCode) => ({ permissionCode })) };
}

function setup() {
  // Audit rows may only be written through tx: the top-level prisma mock has no auditEvent.
  const tx = {
    userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { update: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    session: { updateMany: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    role: { findMany: jest.fn() },
    company: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    site: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const passwords = { hash: jest.fn() };
  passwords.hash.mockResolvedValue('hashed');
  prisma.user.findFirst.mockResolvedValue(null);
  // Default: every requested role exists and holds no administration permission.
  prisma.role.findMany.mockImplementation(async (args: unknown) => {
    const ids = (args as { where: { id: { in: string[] } } }).where.id.in;

    return [ADMIN_ROLE, OTHER_ROLE, PM_ROLE]
      .filter((role) => ids.includes(role.id))
      .map((role) => roleRecord(role));
  });
  prisma.company.findMany.mockResolvedValue([{ id: COMPANY_ID, isActive: true }]);
  prisma.project.findMany.mockResolvedValue([{ id: PROJECT_ID, isActive: true }]);
  prisma.site.findMany.mockResolvedValue([{ id: SITE_ID, isActive: true }]);
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    (arg as (client: typeof tx) => Promise<unknown>)(tx),
  );
  tx.user.update.mockImplementation(async () => userRow());
  tx.user.create.mockImplementation(async () => ({ id: TARGET_ID }));
  tx.user.findUniqueOrThrow.mockImplementation(async () => userRow({ mustChangePassword: true }));

  const service = new UsersService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    new AuditService(),
  );

  return { prisma, tx, service, passwords };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return ((error as ApiError).getResponse() as { code: string }).code;
  }

  return undefined;
}

const baseUpdate = {
  username: 'target',
  email: null,
  displayName: 'Target',
  isActive: true,
  assignments: [global(ADMIN_ROLE.id)],
};

const baseCreate = {
  username: 'new.user',
  email: null,
  displayName: 'New User',
  isActive: true,
  assignments: [global(OTHER_ROLE.id)],
  temporaryPassword: 'Temp12345',
};

describe('UsersService.update rules', () => {
  it('rejects a user deactivating themself with CANNOT_DEACTIVATE_SELF', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow({ id: ACTOR_ID, roles: [link(OTHER_ROLE)] }));

    await expect(
      codeOf(
        service.update(
          ACTOR_ID,
          { ...baseUpdate, isActive: false, assignments: [global(OTHER_ROLE.id)] },
          ACTOR_ID,
        ),
      ),
    ).resolves.toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('rejects deactivating the last active administrator with LAST_ADMINISTRATOR', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.count.mockResolvedValue(0);

    await expect(
      codeOf(service.update(TARGET_ID, { ...baseUpdate, isActive: false }, ACTOR_ID)),
    ).resolves.toBe('LAST_ADMINISTRATOR');
  });

  it('rejects removing the GLOBAL ADMINISTRATOR assignment from the last active administrator', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.count.mockResolvedValue(0);

    await expect(
      codeOf(
        service.update(
          TARGET_ID,
          { ...baseUpdate, assignments: [global(OTHER_ROLE.id)] },
          ACTOR_ID,
        ),
      ),
    ).resolves.toBe('LAST_ADMINISTRATOR');
  });

  it('counts only GLOBAL ADMINISTRATOR assignments of active users when looking for another admin', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.count.mockResolvedValue(1);

    await service.update(TARGET_ID, { ...baseUpdate, isActive: false }, ACTOR_ID);

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { not: TARGET_ID },
        isActive: true,
        roles: {
          some: { scopeType: 'GLOBAL', role: { code: 'ADMINISTRATOR', isActive: true } },
        },
      },
    });
  });

  it('allows deactivating an administrator when another active administrator exists', async () => {
    const { prisma, tx, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.update(TARGET_ID, { ...baseUpdate, isActive: false }, ACTOR_ID),
    ).resolves.toBeDefined();
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('does not check administrator count when the assignment is kept and the user stays active', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await service.update(TARGET_ID, { ...baseUpdate, displayName: 'Renamed' }, ACTOR_ID);

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('does not apply the administrator rule to a scoped ADMINISTRATOR-less user or non-administrators', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow({ roles: [link(OTHER_ROLE)] }));

    await service.update(
      TARGET_ID,
      { ...baseUpdate, isActive: false, assignments: [global(OTHER_ROLE.id)] },
      ACTOR_ID,
    );

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('rejects a duplicate username case-insensitively', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'other' });

    await expect(codeOf(service.update(TARGET_ID, baseUpdate, ACTOR_ID))).resolves.toBe(
      'DUPLICATE_USERNAME',
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { equals: 'target', mode: 'insensitive' },
        }) as unknown,
      }),
    );
  });

  it('writes only the assignment difference and keeps unchanged assignments', async () => {
    const { prisma, tx, service } = setup();
    const keptLink = link(OTHER_ROLE);
    const droppedLink = link(PM_ROLE, { scopeType: 'COMPANY', companyId: COMPANY_ID });

    prisma.user.findUnique.mockResolvedValue(userRow({ roles: [keptLink, droppedLink] }));

    await service.update(
      TARGET_ID,
      {
        ...baseUpdate,
        assignments: [
          global(OTHER_ROLE.id),
          {
            roleId: PM_ROLE.id,
            scopeType: 'PROJECT',
            companyId: null,
            projectId: PROJECT_ID,
            siteId: null,
          },
        ],
      },
      ACTOR_ID,
    );

    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [droppedLink.id] } },
    });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: TARGET_ID,
          roleId: PM_ROLE.id,
          scopeType: 'PROJECT',
          companyId: null,
          projectId: PROJECT_ID,
          siteId: null,
          createdById: ACTOR_ID,
        },
      ],
    });
  });
});

describe('assignment validation', () => {
  const company = {
    roleId: PM_ROLE.id,
    scopeType: 'COMPANY' as const,
    companyId: COMPANY_ID,
    projectId: null,
    siteId: null,
  };

  it.each([
    ['GLOBAL with a company', { ...global(OTHER_ROLE.id), companyId: COMPANY_ID }],
    ['COMPANY without a target', { ...company, companyId: null }],
    ['COMPANY with a project too', { ...company, projectId: PROJECT_ID }],
    [
      'PROJECT with a site',
      {
        ...company,
        scopeType: 'PROJECT' as const,
        companyId: null,
        projectId: PROJECT_ID,
        siteId: SITE_ID,
      },
    ],
    ['SITE with a company', { ...company, scopeType: 'SITE' as const, siteId: SITE_ID }],
  ])('rejects %s with INVALID_SCOPE', async (_label, assignment) => {
    const { service } = setup();

    await expect(
      codeOf(service.create({ ...baseCreate, assignments: [assignment] }, ACTOR_ID)),
    ).resolves.toBe('INVALID_SCOPE');
  });

  it('rejects a target that does not exist with INVALID_SCOPE', async () => {
    const { prisma, service } = setup();
    prisma.company.findMany.mockResolvedValue([]);

    await expect(
      codeOf(service.create({ ...baseCreate, assignments: [company] }, ACTOR_ID)),
    ).resolves.toBe('INVALID_SCOPE');
  });

  it.each([
    ['company', 'company', company],
    [
      'project',
      'project',
      { ...company, scopeType: 'PROJECT' as const, companyId: null, projectId: PROJECT_ID },
    ],
    ['site', 'site', { ...company, scopeType: 'SITE' as const, companyId: null, siteId: SITE_ID }],
  ])(
    'rejects a NEW assignment to an inactive %s with SCOPE_TARGET_INACTIVE',
    async (_label, table, assignment) => {
      const { prisma, service } = setup();
      const id = assignment.companyId ?? assignment.projectId ?? assignment.siteId;

      (prisma as unknown as Record<string, { findMany: jest.Mock }>)[
        table
      ]?.findMany.mockResolvedValue([{ id, isActive: false }]);

      await expect(
        codeOf(service.create({ ...baseCreate, assignments: [assignment] }, ACTOR_ID)),
      ).resolves.toBe('SCOPE_TARGET_INACTIVE');
    },
  );

  it('lets an update KEEP an existing assignment whose target was deactivated since', async () => {
    const { prisma, tx, service } = setup();
    const existingLink = link(PM_ROLE, { scopeType: 'COMPANY', companyId: COMPANY_ID });

    prisma.user.findUnique.mockResolvedValue(userRow({ roles: [existingLink] }));
    prisma.company.findMany.mockResolvedValue([{ id: COMPANY_ID, isActive: false }]);

    await expect(
      service.update(TARGET_ID, { ...baseUpdate, assignments: [company] }, ACTOR_ID),
    ).resolves.toBeDefined();
    expect(tx.userRole.createMany).not.toHaveBeenCalled();
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects the ADMINISTRATOR role at a non-global scope with ADMIN_ROLE_MUST_BE_GLOBAL', async () => {
    const { service } = setup();

    await expect(
      codeOf(
        service.create(
          { ...baseCreate, assignments: [{ ...company, roleId: ADMIN_ROLE.id }] },
          ACTOR_ID,
        ),
      ),
    ).resolves.toBe('ADMIN_ROLE_MUST_BE_GLOBAL');
  });

  it('rejects a role holding any administration.* permission at a non-global scope', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([
      roleRecord(USERS_ROLE, ['masters.items.view', 'administration.users.view']),
    ]);

    await expect(
      codeOf(
        service.create(
          { ...baseCreate, assignments: [{ ...company, roleId: USERS_ROLE.id }] },
          ACTOR_ID,
        ),
      ),
    ).resolves.toBe('ROLE_HAS_ADMIN_PERMISSIONS_MUST_BE_GLOBAL');
  });

  it('accepts a role holding administration.* permissions at GLOBAL scope', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([roleRecord(USERS_ROLE, ['administration.users.view'])]);

    await expect(
      service.create({ ...baseCreate, assignments: [global(USERS_ROLE.id)] }, ACTOR_ID),
    ).resolves.toBeDefined();
  });

  it('rejects the same role at the same scope twice with DUPLICATE_ASSIGNMENT', async () => {
    const { service } = setup();

    await expect(
      codeOf(service.create({ ...baseCreate, assignments: [company, { ...company }] }, ACTOR_ID)),
    ).resolves.toBe('DUPLICATE_ASSIGNMENT');
    await expect(
      codeOf(
        service.create(
          { ...baseCreate, assignments: [global(OTHER_ROLE.id), global(OTHER_ROLE.id)] },
          ACTOR_ID,
        ),
      ),
    ).resolves.toBe('DUPLICATE_ASSIGNMENT');
  });

  it('allows the same role at different scopes', async () => {
    const { service } = setup();

    await expect(
      service.create(
        {
          ...baseCreate,
          assignments: [
            company,
            { ...company, scopeType: 'PROJECT', companyId: null, projectId: PROJECT_ID },
          ],
        },
        ACTOR_ID,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown role id with INVALID_ROLE', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([]);

    await expect(
      codeOf(service.create({ ...baseCreate, assignments: [global(OTHER_ROLE.id)] }, ACTOR_ID)),
    ).resolves.toBe('INVALID_ROLE');
  });

  it('rejects before writing anything', async () => {
    const { prisma, service } = setup();

    await codeOf(
      service.create({ ...baseCreate, assignments: [{ ...company, companyId: null }] }, ACTOR_ID),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('UsersService create, reset password and unlock', () => {
  it('creates the user with mustChangePassword and a hashed temporary password', async () => {
    const { tx, service, passwords } = setup();

    await service.create(baseCreate, ACTOR_ID);

    expect(passwords.hash).toHaveBeenCalledWith('Temp12345');
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: 'hashed',
          mustChangePassword: true,
          createdById: ACTOR_ID,
        }) as unknown,
      }),
    );
  });

  it('writes the assignments in the same transaction, stamped with the creator', async () => {
    const { tx, prisma, service } = setup();

    await service.create(
      {
        ...baseCreate,
        assignments: [
          global(OTHER_ROLE.id),
          {
            roleId: PM_ROLE.id,
            scopeType: 'SITE',
            companyId: null,
            projectId: null,
            siteId: SITE_ID,
          },
        ],
      },
      ACTOR_ID,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          roleId: OTHER_ROLE.id,
          scopeType: 'GLOBAL',
          createdById: ACTOR_ID,
        }),
        expect.objectContaining({
          roleId: PM_ROLE.id,
          scopeType: 'SITE',
          siteId: SITE_ID,
          createdById: ACTOR_ID,
        }),
      ],
    });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('reset-password sets mustChangePassword and revokes all sessions of that user', async () => {
    const { prisma, tx, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });

    await service.resetPassword(TARGET_ID, { newPassword: 'Temp12345' }, ACTOR_ID);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { passwordHash: 'hashed', mustChangePassword: true, updatedById: ACTOR_ID },
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('unlock clears the failed count and the lock', async () => {
    const { prisma, tx, service } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: TARGET_ID,
      failedLoginCount: 3,
      lockedUntil: null,
    });

    await service.unlock(TARGET_ID, ACTOR_ID);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { failedLoginCount: 0, lockedUntil: null, updatedById: ACTOR_ID },
    });
  });

  it('returns NOT_FOUND for an unknown user', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(codeOf(service.unlock(TARGET_ID, ACTOR_ID))).resolves.toBe('NOT_FOUND');
  });
});

describe('audit snapshot of assignments', () => {
  it('lists assignments readably, for example "PROJECT_MANAGER @ PROJECT P001"', async () => {
    const { prisma, tx, service } = setup();
    const project = { id: PROJECT_ID, code: 'P001', name: 'Metro', isActive: true };
    const before = userRow({ roles: [link(OTHER_ROLE)] });
    const after = userRow({
      roles: [
        link(OTHER_ROLE),
        link(PM_ROLE, { scopeType: 'PROJECT', projectId: PROJECT_ID }, { project }),
      ],
    });

    prisma.user.findUnique.mockResolvedValue(before);
    tx.user.findUniqueOrThrow.mockImplementation(async () => after);

    await service.update(
      TARGET_ID,
      {
        ...baseUpdate,
        assignments: [
          global(OTHER_ROLE.id),
          {
            roleId: PM_ROLE.id,
            scopeType: 'PROJECT',
            companyId: null,
            projectId: PROJECT_ID,
            siteId: null,
          },
        ],
      },
      ACTOR_ID,
    );

    const event = (tx.auditEvent.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

    expect((event.before as { assignments: string[] }).assignments).toEqual(['CLERK @ GLOBAL']);
    expect((event.after as { assignments: string[] }).assignments).toEqual([
      'CLERK @ GLOBAL',
      'PROJECT_MANAGER @ PROJECT P001',
    ]);
  });
});

describe('UsersService.list', () => {
  it('searches username, email and display name and filters by active', async () => {
    const { prisma, service } = setup();
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    await service.list({
      page: 2,
      pageSize: 10,
      search: 'ann',
      active: 'true',
      sortBy: 'username',
      sortDir: 'asc',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: {
          isActive: true,
          OR: [
            { username: { contains: 'ann', mode: 'insensitive' } },
            { email: { contains: 'ann', mode: 'insensitive' } },
            { displayName: { contains: 'ann', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('role options flag the roles that can only be assigned globally', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([
      { ...roleRecord(ADMIN_ROLE), isActive: true },
      { ...roleRecord(PM_ROLE, ['masters.projects.view']), isActive: true },
      { ...roleRecord(USERS_ROLE, ['administration.users.view']), isActive: true },
    ]);

    const result = await service.roleOptions();

    expect(result.items.map((item) => [item.code, item.requiresGlobalScope])).toEqual([
      ['ADMINISTRATOR', true],
      ['PROJECT_MANAGER', false],
      ['USER_CLERK', true],
    ]);
  });
});

describe('item manage/approve roles are global-only (OQ-34)', () => {
  const company = {
    roleId: USERS_ROLE.id,
    scopeType: 'COMPANY' as const,
    companyId: COMPANY_ID,
    projectId: null,
    siteId: null,
  };

  it.each(['masters.items.manage', 'masters.items.approve'])(
    'rejects a role holding %s below GLOBAL',
    async (permission) => {
      const { prisma, service } = setup();
      prisma.role.findMany.mockResolvedValue([
        roleRecord(USERS_ROLE, ['masters.items.view', permission]),
      ]);

      await expect(
        codeOf(service.create({ ...baseCreate, assignments: [company] }, ACTOR_ID)),
      ).resolves.toBe('ROLE_HAS_ADMIN_PERMISSIONS_MUST_BE_GLOBAL');
    },
  );

  it('accepts a role with only masters.items.view at company scope', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([roleRecord(USERS_ROLE, ['masters.items.view'])]);

    await expect(
      service.create({ ...baseCreate, assignments: [company] }, ACTOR_ID),
    ).resolves.toBeDefined();
  });

  it('role options flag an item-approve role as global-only', async () => {
    const { prisma, service } = setup();
    prisma.role.findMany.mockResolvedValue([
      { ...roleRecord(USERS_ROLE, ['masters.items.approve']), isActive: true },
    ]);

    const result = await service.roleOptions();

    expect(result.items[0]?.requiresGlobalScope).toBe(true);
  });
});
