import { jest } from '@jest/globals';
import type { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';

const PROJECT_ID = 'p1';
const COMPANY_ID = 'c1';

type Row = {
  scopeType: 'GLOBAL' | 'COMPANY' | 'PROJECT' | 'SITE';
  companyId: string | null;
  projectId: string | null;
  siteId: string | null;
  role: { code: string; isActive: boolean; permissions: Array<{ permissionCode: string }> };
  user: { id: string; username: string; displayName: string; email: string | null };
};

function row(
  userId: string,
  scopeType: Row['scopeType'],
  target: Partial<Pick<Row, 'companyId' | 'projectId' | 'siteId'>> = {},
  roleCode = 'PROJECT_MANAGER',
): Row {
  return {
    scopeType,
    companyId: target.companyId ?? null,
    projectId: target.projectId ?? null,
    siteId: target.siteId ?? null,
    role: { code: roleCode, isActive: true, permissions: [] },
    user: { id: userId, username: userId, displayName: userId, email: null },
  };
}

function setup(rows: Row[], project: { companyId: string } | null = { companyId: COMPANY_ID }) {
  const findMany = jest.fn(async (_args: unknown) => rows);
  const prisma = {
    project: { findUnique: jest.fn(async () => project) },
    userRole: { findMany },
  };

  return {
    findMany,
    service: new AccessService(prisma as unknown as PrismaService),
  };
}

describe('AccessService.findUsersWithRoleCovering', () => {
  it('returns users holding the role on GLOBAL, the project company, or the project', async () => {
    const { service } = setup([
      row('global-user', 'GLOBAL'),
      row('company-user', 'COMPANY', { companyId: COMPANY_ID }),
      row('project-user', 'PROJECT', { projectId: PROJECT_ID }),
    ]);

    const users = await service.findUsersWithRoleCovering('PROJECT_MANAGER', PROJECT_ID);

    expect(users.map((user) => user.id)).toEqual(['global-user', 'company-user', 'project-user']);
  });

  it('asks the database for active users with an active role at exactly those three scopes', async () => {
    const { service, findMany } = setup([]);

    await service.findUsersWithRoleCovering('PROJECT_MANAGER', PROJECT_ID);

    const args = findMany.mock.calls[0]?.[0] as {
      where: { role: unknown; user: unknown; OR: unknown };
    };

    expect(args.where.role).toEqual({ code: 'PROJECT_MANAGER', isActive: true });
    expect(args.where.user).toEqual({ isActive: true });
    expect(args.where.OR).toEqual([
      { scopeType: 'GLOBAL' },
      { scopeType: 'COMPANY', companyId: COMPANY_ID },
      { scopeType: 'PROJECT', projectId: PROJECT_ID },
    ]);
  });

  it('lists a user once even when several assignments cover the project', async () => {
    const { service } = setup([
      row('both', 'GLOBAL'),
      row('both', 'COMPANY', { companyId: COMPANY_ID }),
    ]);

    await expect(
      service.findUsersWithRoleCovering('PROJECT_MANAGER', PROJECT_ID),
    ).resolves.toHaveLength(1);
  });

  it('does not report a narrower ADMINISTRATOR assignment (that role only counts at GLOBAL)', async () => {
    const { service } = setup([
      row('scoped-admin', 'COMPANY', { companyId: COMPANY_ID }, 'ADMINISTRATOR'),
      row('global-admin', 'GLOBAL', {}, 'ADMINISTRATOR'),
    ]);

    const users = await service.findUsersWithRoleCovering('ADMINISTRATOR', PROJECT_ID);

    expect(users.map((user) => user.id)).toEqual(['global-admin']);
  });

  it('ignores rows that do not cover the project even if the query returned them', async () => {
    const { service } = setup([
      row('other-company', 'COMPANY', { companyId: 'c2' }),
      row('other-project', 'PROJECT', { projectId: 'p2' }),
      row('site-user', 'SITE', { siteId: 's1' }),
    ]);

    await expect(service.findUsersWithRoleCovering('PROJECT_MANAGER', PROJECT_ID)).resolves.toEqual(
      [],
    );
  });

  it('returns nothing for an unknown project', async () => {
    const { service, findMany } = setup([row('global-user', 'GLOBAL')], null);

    await expect(service.findUsersWithRoleCovering('PROJECT_MANAGER', 'missing')).resolves.toEqual(
      [],
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
