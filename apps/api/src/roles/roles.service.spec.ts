import { jest } from '@jest/globals';
import { ALL_PERMISSIONS } from '@uie/contracts';
import { ApiError } from '../common/errors/api-error';
import type { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';

const ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
    _count: { users: 2 },
    ...overrides,
  };
}

function adminRow() {
  return roleRow({
    code: 'ADMINISTRATOR',
    name: 'Administrator',
    isSystem: true,
    permissions: ALL_PERMISSIONS.map((permissionCode) => ({ roleId: ROLE_ID, permissionCode })),
  });
}

function setup() {
  const tx = {
    rolePermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    role: { update: jest.fn() },
  };
  const prisma = {
    role: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.role.findFirst.mockResolvedValue(null);
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    (arg as (client: typeof tx) => Promise<unknown>)(tx),
  );
  tx.role.update.mockImplementation(async () => roleRow());

  return { prisma, tx, service: new RolesService(prisma as unknown as PrismaService) };
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

describe('RolesService system role protection', () => {
  const adminRequest = {
    code: 'ADMINISTRATOR',
    name: 'Administrator',
    isActive: true,
    permissionCodes: [...ALL_PERMISSIONS],
  };

  it('rejects renaming a system role', async () => {
    const { prisma, service } = setup();
    prisma.role.findUnique.mockResolvedValue(adminRow());

    await expect(codeOf(service.update(ROLE_ID, { ...adminRequest, name: 'Boss' }))).resolves.toBe(
      'SYSTEM_ROLE_PROTECTED',
    );
  });

  it('rejects deactivating a system role', async () => {
    const { prisma, service } = setup();
    prisma.role.findUnique.mockResolvedValue(adminRow());

    await expect(
      codeOf(service.update(ROLE_ID, { ...adminRequest, isActive: false })),
    ).resolves.toBe('SYSTEM_ROLE_PROTECTED');
  });

  it('rejects editing ADMINISTRATOR permissions', async () => {
    const { prisma, service } = setup();
    prisma.role.findUnique.mockResolvedValue(adminRow());

    await expect(
      codeOf(service.update(ROLE_ID, { ...adminRequest, permissionCodes: ['stores.stock.view'] })),
    ).resolves.toBe('SYSTEM_ROLE_PROTECTED');
  });

  it('accepts an unchanged save of a system role without writing', async () => {
    const { prisma, tx, service } = setup();
    prisma.role.findUnique.mockResolvedValue(adminRow());

    const result = await service.update(ROLE_ID, adminRequest);

    expect(result.permissionCodes).toEqual([...ALL_PERMISSIONS]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.role.update).not.toHaveBeenCalled();
  });

  it('reports every permission for ADMINISTRATOR even when rows are missing', async () => {
    const { prisma, service } = setup();
    prisma.role.findUnique.mockResolvedValue({ ...adminRow(), permissions: [] });

    const result = await service.get(ROLE_ID);

    expect(result.permissionCodes).toEqual([...ALL_PERMISSIONS]);
  });
});

describe('RolesService custom roles', () => {
  it('replaces permissions of a custom role', async () => {
    const { prisma, tx, service } = setup();
    prisma.role.findUnique.mockResolvedValue(roleRow());

    await service.update(ROLE_ID, {
      code: 'CLERK',
      name: 'Clerk',
      isActive: false,
      permissionCodes: ['stores.stock.view', 'stores.goodsReceipts.view'],
    });

    expect(tx.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: ROLE_ID } });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: ROLE_ID, permissionCode: 'stores.stock.view' },
        { roleId: ROLE_ID, permissionCode: 'stores.goodsReceipts.view' },
      ],
    });
    expect(tx.role.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: 'CLERK', name: 'Clerk', isActive: false },
      }),
    );
  });

  it('rejects permission codes that are not in ALL_PERMISSIONS', async () => {
    const { prisma, service } = setup();
    prisma.role.findUnique.mockResolvedValue(roleRow());

    await expect(
      codeOf(
        service.update(ROLE_ID, {
          code: 'CLERK',
          name: 'Clerk',
          isActive: true,
          permissionCodes: ['made.up.permission'] as never,
        }),
      ),
    ).resolves.toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate role code on create', async () => {
    const { prisma, service } = setup();
    prisma.role.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      codeOf(service.create({ code: 'CLERK', name: 'Clerk', isActive: true, permissionCodes: [] })),
    ).resolves.toBe('DUPLICATE_ROLE_CODE');
  });

  it('creates custom roles as non-system', async () => {
    const { prisma, service } = setup();
    prisma.role.create.mockResolvedValue(roleRow());

    await service.create({
      code: 'CLERK',
      name: 'Clerk',
      isActive: true,
      permissionCodes: ['stores.stock.view'],
    });

    expect(prisma.role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSystem: false }) as unknown,
      }),
    );
  });
});
