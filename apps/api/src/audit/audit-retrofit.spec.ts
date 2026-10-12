import { jest } from '@jest/globals';
import { ALL_PERMISSIONS } from '@uie/contracts';
import type { PasswordService } from '../auth/password.service';
import type { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLERK = { id: ROLE_ID, code: 'CLERK', name: 'Clerk' };

interface Write {
  table: string;
  data: unknown;
}

/** One role assignment row as the access query returns it (GLOBAL unless overridden). */
function link(role: { id: string; code: string; name: string }, overrides = {}) {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    userId: USER_ID,
    roleId: role.id,
    scopeType: 'GLOBAL',
    companyId: null,
    projectId: null,
    siteId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdById: null,
    role,
    company: null,
    project: null,
    site: null,
    ...overrides,
  };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'target',
    email: null,
    displayName: 'Target',
    passwordHash: 'SECRET-HASH',
    isActive: true,
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    roles: [link(CLERK)],
    ...overrides,
  };
}

function roleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROLE_ID,
    code: 'CLERK',
    name: 'Clerk',
    isSystem: false,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    permissions: [{ roleId: ROLE_ID, permissionCode: 'stores.stock.view' }],
    _count: { users: 0 },
    ...overrides,
  };
}

/**
 * Transactions keep their writes only if the callback resolves, as a real database would:
 * writes are buffered per transaction and discarded when the callback throws.
 */
function setup() {
  const committed: Write[] = [];
  let pending: Write[] = [];
  const recorder = (table: string, result?: () => unknown) =>
    jest.fn(async (arg: unknown) => {
      pending.push({ table, data: arg });
      return result?.();
    });
  const tx = {
    user: {
      create: recorder('user.create', () => userRow()),
      update: recorder('user.update', () => userRow()),
      findUniqueOrThrow: jest.fn(async () => userRow()),
    },
    userRole: {
      deleteMany: recorder('userRole.deleteMany'),
      createMany: recorder('userRole.createMany'),
    },
    session: { updateMany: recorder('session.updateMany') },
    role: {
      create: recorder('role.create', () => roleRow()),
      update: recorder('role.update', () => roleRow()),
    },
    rolePermission: {
      deleteMany: recorder('rolePermission.deleteMany'),
      createMany: recorder('rolePermission.createMany'),
    },
    auditEvent: { create: recorder('auditEvent.create') },
  };
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    role: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    company: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    site: { findMany: jest.fn() },
    // An audit write on the top-level client (outside the transaction) would throw.
    auditEvent: {
      create: jest.fn(() => {
        throw new Error('audit written outside the transaction');
      }),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      pending = [];
      const result = await callback(tx);
      committed.push(...pending);
      return result;
    }),
  };
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.role.findFirst.mockResolvedValue(null);
  prisma.role.count.mockResolvedValue(1);
  prisma.role.findMany.mockResolvedValue([{ ...CLERK, permissions: [] }]);

  const audit = new AuditService();
  const passwords = { hash: jest.fn(async () => 'NEW-SECRET-HASH') };
  const users = new UsersService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    audit,
  );
  const roles = new RolesService(prisma as unknown as PrismaService, audit);

  return { prisma, tx, committed, users, roles };
}

function auditRows(committed: Write[]): Record<string, unknown>[] {
  return committed
    .filter((entry) => entry.table === 'auditEvent.create')
    .map((entry) => (entry.data as { data: Record<string, unknown> }).data);
}

const userRequest = {
  username: 'target',
  email: null,
  displayName: 'Target',
  isActive: true,
  assignments: [
    {
      roleId: ROLE_ID,
      scopeType: 'GLOBAL' as const,
      companyId: null,
      projectId: null,
      siteId: null,
    },
  ],
};

describe('audit is written in the same transaction as the change', () => {
  it('user create', async () => {
    const { prisma, tx, committed, users } = setup();

    await users.create({ ...userRequest, temporaryPassword: 'Temp12345' }, ACTOR);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(auditRows(committed)).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'User',
        entityId: USER_ID,
        actorUserId: ACTOR,
      }),
    ]);
  });

  it('user update', async () => {
    const { prisma, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await users.update(USER_ID, { ...userRequest, displayName: 'Renamed' }, ACTOR);

    expect(auditRows(committed)).toEqual([
      expect.objectContaining({ action: 'UPDATE', entityType: 'User' }),
    ]);
  });

  it('records DEACTIVATE when the active flag is switched off', async () => {
    const { prisma, tx, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow({ roles: [link(CLERK)] }));
    tx.user.findUniqueOrThrow.mockImplementation(async () => userRow({ isActive: false }));

    await users.update(USER_ID, { ...userRequest, isActive: false }, ACTOR);

    expect(auditRows(committed)[0]).toEqual(expect.objectContaining({ action: 'DEACTIVATE' }));
  });

  it('reset password stores only {"passwordReset": true}', async () => {
    const { prisma, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

    await users.resetPassword(USER_ID, { newPassword: 'Temp12345' }, ACTOR);

    expect(auditRows(committed)).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        before: undefined,
        after: { passwordReset: true },
      }),
    ]);
  });

  it('unlock', async () => {
    const { prisma, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      failedLoginCount: 4,
      lockedUntil: null,
    });

    await users.unlock(USER_ID, ACTOR);

    expect(auditRows(committed)).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        before: { failedLoginCount: 4, lockedUntil: null },
        after: { failedLoginCount: 0, lockedUntil: null },
      }),
    ]);
  });

  it('role create and update (with permission changes)', async () => {
    const { prisma, tx, committed, roles } = setup();

    await roles.create(
      { code: 'CLERK', name: 'Clerk', isActive: true, permissionCodes: ['stores.stock.view'] },
      ACTOR,
    );
    prisma.role.findUnique.mockResolvedValue(roleRow());
    tx.role.update.mockImplementation(async () =>
      roleRow({
        permissions: [
          { roleId: ROLE_ID, permissionCode: 'stores.stock.view' },
          { roleId: ROLE_ID, permissionCode: 'stores.goodsReceipts.view' },
        ],
      }),
    );
    await roles.update(
      ROLE_ID,
      {
        code: 'CLERK',
        name: 'Clerk',
        isActive: true,
        permissionCodes: ['stores.stock.view', 'stores.goodsReceipts.view'],
      },
      ACTOR,
    );

    const rows = auditRows(committed);

    expect(rows.map((row) => row.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows.every((row) => row.entityType === 'Role')).toBe(true);
    expect(rows[1]?.before).toEqual(
      expect.objectContaining({ permissionCodes: ['stores.stock.view'] }),
    );
    expect(rows[1]?.after).toEqual(
      expect.objectContaining({
        permissionCodes: ['stores.goodsReceipts.view', 'stores.stock.view'],
      }),
    );
  });
});

describe('no audit when the change fails', () => {
  it('keeps no audit row when the change throws inside the transaction', async () => {
    const { prisma, tx, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    tx.user.update.mockRejectedValue(new Error('database error'));

    await expect(users.update(USER_ID, userRequest, ACTOR)).rejects.toThrow('database error');

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(committed).toEqual([]);
  });

  it('rolls back the change when the audit write fails', async () => {
    const { prisma, tx, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    tx.auditEvent.create.mockRejectedValue(new Error('audit failed'));

    await expect(users.resetPassword(USER_ID, { newPassword: 'Temp12345' }, ACTOR)).rejects.toThrow(
      'audit failed',
    );

    expect(committed).toEqual([]);
  });

  it('writes nothing when validation rejects the request before the transaction', async () => {
    const { prisma, users } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'other' });

    await expect(users.update(USER_ID, userRequest, ACTOR)).rejects.toBeDefined();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing for a protected system role', async () => {
    const { prisma, committed, roles } = setup();
    prisma.role.findUnique.mockResolvedValue(
      roleRow({
        code: 'ADMINISTRATOR',
        isSystem: true,
        permissions: ALL_PERMISSIONS.map((permissionCode) => ({
          roleId: ROLE_ID,
          permissionCode,
        })),
      }),
    );

    await expect(
      roles.update(
        ROLE_ID,
        {
          code: 'ADMINISTRATOR',
          name: 'Boss',
          isActive: true,
          permissionCodes: [...ALL_PERMISSIONS],
        },
        ACTOR,
      ),
    ).rejects.toBeDefined();

    expect(committed).toEqual([]);
  });
});

describe('secrets are excluded from audit snapshots', () => {
  it('user audit rows never contain password hashes or passwords', async () => {
    const { prisma, committed, users } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await users.create({ ...userRequest, temporaryPassword: 'Temp12345' }, ACTOR);
    await users.update(USER_ID, userRequest, ACTOR);
    await users.resetPassword(USER_ID, { newPassword: 'Temp12345' }, ACTOR);

    const rows = auditRows(committed);

    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toMatch(/SECRET-HASH|passwordHash|Temp12345/);
  });
});
