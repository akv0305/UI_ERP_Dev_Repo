import { jest } from '@jest/globals';
import { ApiError } from '../common/errors/api-error';
import type { PasswordService } from '../auth/password.service';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const ADMIN_ROLE = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'ADMINISTRATOR',
  name: 'Administrator',
};
const OTHER_ROLE = { id: '22222222-2222-4222-8222-222222222222', code: 'CLERK', name: 'Clerk' };
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    roles: [{ role: ADMIN_ROLE }],
    ...overrides,
  };
}

function setup() {
  const tx = {
    userRole: { deleteMany: jest.fn() },
    user: { update: jest.fn() },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: { count: jest.fn() },
    session: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const passwords = { hash: jest.fn() };
  passwords.hash.mockResolvedValue('hashed');
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.role.count.mockResolvedValue(1);
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (client: typeof tx) => Promise<unknown>)(tx);
    }

    return arg;
  });
  tx.user.update.mockImplementation(async () => userRow());

  const service = new UsersService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
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
  roleIds: [ADMIN_ROLE.id],
};

describe('UsersService.update rules', () => {
  it('rejects a user deactivating themself with CANNOT_DEACTIVATE_SELF', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(
      userRow({ id: ACTOR_ID, roles: [{ role: OTHER_ROLE }] }),
    );

    await expect(
      codeOf(
        service.update(
          ACTOR_ID,
          { ...baseUpdate, isActive: false, roleIds: [OTHER_ROLE.id] },
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

  it('rejects removing the ADMINISTRATOR role from the last active administrator', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.count.mockResolvedValue(0);

    await expect(
      codeOf(service.update(TARGET_ID, { ...baseUpdate, roleIds: [OTHER_ROLE.id] }, ACTOR_ID)),
    ).resolves.toBe('LAST_ADMINISTRATOR');
  });

  it('allows deactivating an administrator when another active administrator exists', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.update(TARGET_ID, { ...baseUpdate, isActive: false }, ACTOR_ID),
    ).resolves.toBeDefined();
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('does not check administrator count when the role is kept and the user stays active', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await service.update(TARGET_ID, { ...baseUpdate, displayName: 'Renamed' }, ACTOR_ID);

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('does not apply the administrator rule to non-administrators', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(userRow({ roles: [{ role: OTHER_ROLE }] }));

    await service.update(
      TARGET_ID,
      { ...baseUpdate, isActive: false, roleIds: [OTHER_ROLE.id] },
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
});

describe('UsersService create, reset password and unlock', () => {
  it('creates the user with mustChangePassword and a hashed temporary password', async () => {
    const { prisma, service, passwords } = setup();
    prisma.user.create.mockResolvedValue(userRow({ mustChangePassword: true }));

    await service.create(
      {
        username: 'new.user',
        email: null,
        displayName: 'New User',
        isActive: true,
        roleIds: [OTHER_ROLE.id],
        temporaryPassword: 'Temp12345',
      },
      ACTOR_ID,
    );

    expect(passwords.hash).toHaveBeenCalledWith('Temp12345');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: 'hashed',
          mustChangePassword: true,
          createdById: ACTOR_ID,
        }) as unknown,
      }),
    );
  });

  it('rejects an unknown role id with INVALID_ROLE', async () => {
    const { prisma, service } = setup();
    prisma.role.count.mockResolvedValue(0);

    await expect(
      codeOf(
        service.create(
          {
            username: 'x',
            email: null,
            displayName: 'X',
            isActive: true,
            roleIds: [OTHER_ROLE.id],
            temporaryPassword: 'Temp12345',
          },
          ACTOR_ID,
        ),
      ),
    ).resolves.toBe('INVALID_ROLE');
  });

  it('reset-password sets mustChangePassword and revokes all sessions of that user', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });

    await service.resetPassword(TARGET_ID, { newPassword: 'Temp12345' }, ACTOR_ID);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { passwordHash: 'hashed', mustChangePassword: true, updatedById: ACTOR_ID },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('unlock clears the failed count and the lock', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });

    await service.unlock(TARGET_ID, ACTOR_ID);

    expect(prisma.user.update).toHaveBeenCalledWith({
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
});
