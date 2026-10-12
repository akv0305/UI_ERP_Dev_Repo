import { ALL_PERMISSIONS, type Permission, type RoleScopeType } from '@uie/contracts';
import {
  AccessContext,
  covers,
  type AccessAssignment,
  type AccessLookup,
  type ResolvedTarget,
} from './access-context';

// Fixture hierarchy:  C1 > P1 > S1 > T1,  C1 > P2 > S2,  C2 > P3 > S3 > T3
const C1 = 'c1';
const C2 = 'c2';
const P1 = 'p1';
const P2 = 'p2';
const P3 = 'p3';
const S1 = 's1';
const S2 = 's2';
const S3 = 's3';
const T1 = 't1';
const T3 = 't3';

const PROJECT_COMPANY: Record<string, string> = { [P1]: C1, [P2]: C1, [P3]: C2 };
const SITE_PROJECT: Record<string, string> = { [S1]: P1, [S2]: P2, [S3]: P3 };
const STORE_SITE: Record<string, string> = { [T1]: S1, [T3]: S3 };

const lookup: AccessLookup = {
  projectsOfCompanies: (ids) =>
    Promise.resolve(Object.keys(PROJECT_COMPANY).filter((p) => ids.includes(PROJECT_COMPANY[p]!))),
  sitesOfProjects: (ids) =>
    Promise.resolve(Object.keys(SITE_PROJECT).filter((s) => ids.includes(SITE_PROJECT[s]!))),
  companiesOfProjects: (ids) => Promise.resolve([...new Set(ids.map((p) => PROJECT_COMPANY[p]!))]),
  projectsOfSites: (ids) => Promise.resolve([...new Set(ids.map((s) => SITE_PROJECT[s]!))]),
  companyOfProject: (id) => Promise.resolve(PROJECT_COMPANY[id] ?? null),
  parentsOfSite: (id) => {
    const projectId = SITE_PROJECT[id];

    return Promise.resolve(
      projectId === undefined ? null : { projectId, companyId: PROJECT_COMPANY[projectId]! },
    );
  },
  parentsOfStore: (id) => {
    const siteId = STORE_SITE[id];

    if (siteId === undefined) {
      return Promise.resolve(null);
    }

    const projectId = SITE_PROJECT[siteId]!;

    return Promise.resolve({ siteId, projectId, companyId: PROJECT_COMPANY[projectId]! });
  },
};

function assignment(
  scopeType: RoleScopeType,
  target: { companyId?: string; projectId?: string; siteId?: string },
  permissions: Permission[],
  role: { code?: string; isActive?: boolean } = {},
): AccessAssignment {
  return {
    scopeType,
    companyId: target.companyId ?? null,
    projectId: target.projectId ?? null,
    siteId: target.siteId ?? null,
    role: {
      code: role.code ?? 'CUSTOM',
      isActive: role.isActive ?? true,
      permissions,
    },
  };
}

const MANAGE: Permission = 'masters.projects.manage';

function context(...assignments: AccessAssignment[]): AccessContext {
  return new AccessContext(assignments, lookup);
}

const blank: ResolvedTarget = {
  global: false,
  companyId: null,
  projectId: null,
  siteId: null,
  storeId: null,
};

describe('covers()', () => {
  it('GLOBAL covers every target, including global', () => {
    const a = assignment('GLOBAL', {}, []);

    expect(covers(a, { ...blank, global: true })).toBe(true);
    expect(covers(a, { ...blank, companyId: C2 })).toBe(true);
    expect(covers(a, { ...blank, storeId: T3 })).toBe(true);
  });

  it('COMPANY covers its company, projects, sites and stores but not another company or global', () => {
    const a = assignment('COMPANY', { companyId: C1 }, []);
    const t1 = { ...blank, companyId: C1, projectId: P1, siteId: S1, storeId: T1 };

    expect(covers(a, { ...blank, companyId: C1 })).toBe(true);
    expect(covers(a, t1)).toBe(true);
    expect(covers(a, { ...blank, companyId: C2, projectId: P3 })).toBe(false);
    expect(covers(a, { ...blank, global: true })).toBe(false);
  });

  it('PROJECT covers its project, sites and stores but not the company, siblings or others', () => {
    const a = assignment('PROJECT', { projectId: P1 }, []);

    expect(covers(a, { ...blank, projectId: P1, companyId: C1 })).toBe(true);
    expect(covers(a, { ...blank, siteId: S1, projectId: P1, companyId: C1 })).toBe(true);
    expect(covers(a, { ...blank, storeId: T1, siteId: S1, projectId: P1, companyId: C1 })).toBe(
      true,
    );
    expect(covers(a, { ...blank, companyId: C1 })).toBe(false);
    expect(covers(a, { ...blank, projectId: P2, companyId: C1 })).toBe(false);
  });

  it('SITE covers its site and stores but not the project, siblings or others', () => {
    const a = assignment('SITE', { siteId: S1 }, []);

    expect(covers(a, { ...blank, siteId: S1, projectId: P1, companyId: C1 })).toBe(true);
    expect(covers(a, { ...blank, storeId: T1, siteId: S1, projectId: P1, companyId: C1 })).toBe(
      true,
    );
    expect(covers(a, { ...blank, projectId: P1, companyId: C1 })).toBe(false);
    expect(covers(a, { ...blank, siteId: S2, projectId: P2, companyId: C1 })).toBe(false);
  });
});

describe('AccessContext.can', () => {
  it('lets a GLOBAL holder act on every target', async () => {
    const access = context(assignment('GLOBAL', {}, [MANAGE]));

    await expect(access.can(MANAGE, { global: true })).resolves.toBe(true);
    await expect(access.can(MANAGE, { companyId: C2 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { storeId: T3 })).resolves.toBe(true);
  });

  it('resolves ancestors: a COMPANY holder reaches a project, site and store below it', async () => {
    const access = context(assignment('COMPANY', { companyId: C1 }, [MANAGE]));

    await expect(access.can(MANAGE, { companyId: C1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { projectId: P2 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { siteId: S1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { storeId: T1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { companyId: C2 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { projectId: P3 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { storeId: T3 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { global: true })).resolves.toBe(false);
  });

  it('a PROJECT holder reaches its sites and stores only', async () => {
    const access = context(assignment('PROJECT', { projectId: P1 }, [MANAGE]));

    await expect(access.can(MANAGE, { projectId: P1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { siteId: S1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { storeId: T1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { companyId: C1 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { projectId: P2 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { siteId: S2 })).resolves.toBe(false);
  });

  it('a SITE holder reaches its stores only', async () => {
    const access = context(assignment('SITE', { siteId: S1 }, [MANAGE]));

    await expect(access.can(MANAGE, { siteId: S1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { storeId: T1 })).resolves.toBe(true);
    await expect(access.can(MANAGE, { projectId: P1 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { siteId: S2 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { storeId: T3 })).resolves.toBe(false);
  });

  it('is false for an unknown record and for a permission the role does not hold', async () => {
    const access = context(assignment('COMPANY', { companyId: C1 }, [MANAGE]));

    await expect(access.can(MANAGE, { siteId: 'missing' })).resolves.toBe(false);
    await expect(access.can('masters.companies.manage', { companyId: C1 })).resolves.toBe(false);
  });

  it('requires the permission from the assignment that covers the target (no mixing of scopes)', async () => {
    const access = context(
      assignment('COMPANY', { companyId: C1 }, ['masters.projects.view']),
      assignment('COMPANY', { companyId: C2 }, [MANAGE]),
    );

    await expect(access.can(MANAGE, { projectId: P1 })).resolves.toBe(false);
    await expect(access.can(MANAGE, { projectId: P3 })).resolves.toBe(true);
  });

  it('still covers inactive companies, projects and sites (the lookup does not filter by isActive)', async () => {
    // The lookup above knows nothing about isActive; existing assignments keep working on them.
    const access = context(assignment('PROJECT', { projectId: P1 }, [MANAGE]));

    await expect(access.can(MANAGE, { siteId: S1 })).resolves.toBe(true);
  });
});

describe('administration.* permissions are GLOBAL-only', () => {
  const ADMIN_PERM: Permission = 'administration.users.manage';

  it('are granted by a GLOBAL assignment', async () => {
    const access = context(assignment('GLOBAL', {}, [ADMIN_PERM]));

    await expect(access.can(ADMIN_PERM, { global: true })).resolves.toBe(true);
    expect(access.menuPermissions()).toContain(ADMIN_PERM);
  });

  it.each<RoleScopeType>(['COMPANY', 'PROJECT', 'SITE'])(
    'are ignored when the role is assigned at %s scope',
    async (scopeType) => {
      const target =
        scopeType === 'COMPANY'
          ? { companyId: C1 }
          : scopeType === 'PROJECT'
            ? { projectId: P1 }
            : { siteId: S1 };
      const access = context(assignment(scopeType, target, [ADMIN_PERM, MANAGE]));

      await expect(access.can(ADMIN_PERM, { global: true })).resolves.toBe(false);
      await expect(access.can(ADMIN_PERM, { companyId: C1 })).resolves.toBe(false);
      expect(access.menuPermissions()).not.toContain(ADMIN_PERM);
      // The non-admin permission of the same role still counts at that scope.
      expect(access.menuPermissions()).toContain(MANAGE);
    },
  );

  it('ADMINISTRATOR grants every permission at GLOBAL scope', () => {
    const access = context(assignment('GLOBAL', {}, [], { code: 'ADMINISTRATOR' }));

    expect(access.menuPermissions()).toEqual([...ALL_PERMISSIONS]);
  });

  it('ADMINISTRATOR grants nothing at a non-GLOBAL scope', async () => {
    const access = context(
      assignment('COMPANY', { companyId: C1 }, [MANAGE], { code: 'ADMINISTRATOR' }),
    );

    expect(access.menuPermissions()).toEqual([]);
    await expect(access.can(MANAGE, { companyId: C1 })).resolves.toBe(false);
  });
});

describe('inactive roles', () => {
  it('are ignored for can(), menuPermissions() and the accessible id lists', async () => {
    const access = context(
      assignment('GLOBAL', {}, [MANAGE], { isActive: false }),
      assignment('COMPANY', { companyId: C1 }, [MANAGE], { isActive: false }),
    );

    await expect(access.can(MANAGE, { companyId: C1 })).resolves.toBe(false);
    expect(access.menuPermissions()).toEqual([]);
    await expect(access.accessibleCompanyIds()).resolves.toEqual([]);
    await expect(access.accessibleProjectIds()).resolves.toEqual([]);
  });

  it('do not block an active role held by the same user', () => {
    const access = context(
      assignment('GLOBAL', {}, ['masters.items.view'], { isActive: false }),
      assignment('GLOBAL', {}, ['masters.vendors.view']),
    );

    expect(access.menuPermissions()).toEqual(['masters.vendors.view']);
  });
});

describe('menuPermissions', () => {
  it('is the union over all assignments, in catalogue order, without duplicates', () => {
    const access = context(
      assignment('COMPANY', { companyId: C1 }, ['masters.vendors.view', 'masters.items.view']),
      assignment('PROJECT', { projectId: P3 }, ['masters.items.view', 'stores.stock.view']),
    );

    expect(access.menuPermissions()).toEqual([
      'stores.stock.view',
      'masters.items.view',
      'masters.vendors.view',
    ]);
  });
});

describe('accessible id lists (null = unrestricted)', () => {
  it('are null for a GLOBAL holder', async () => {
    const access = context(assignment('GLOBAL', {}, [MANAGE]));

    await expect(access.accessibleCompanyIds()).resolves.toBeNull();
    await expect(access.accessibleProjectIds()).resolves.toBeNull();
    await expect(access.accessibleSiteIds()).resolves.toBeNull();
    await expect(access.contextCompanyIds()).resolves.toBeNull();
    await expect(access.contextProjectIds()).resolves.toBeNull();
  });

  it('expand a COMPANY assignment down to projects and sites', async () => {
    const access = context(assignment('COMPANY', { companyId: C1 }, [MANAGE]));

    await expect(access.accessibleCompanyIds()).resolves.toEqual([C1]);
    await expect(access.accessibleProjectIds()).resolves.toEqual([P1, P2]);
    await expect(access.accessibleSiteIds()).resolves.toEqual([S1, S2]);
  });

  it('expand a PROJECT assignment down to sites and list no companies', async () => {
    const access = context(assignment('PROJECT', { projectId: P3 }, [MANAGE]));

    await expect(access.accessibleCompanyIds()).resolves.toEqual([]);
    await expect(access.accessibleProjectIds()).resolves.toEqual([P3]);
    await expect(access.accessibleSiteIds()).resolves.toEqual([S3]);
  });

  it('list only the site for a SITE assignment', async () => {
    const access = context(assignment('SITE', { siteId: S2 }, [MANAGE]));

    await expect(access.accessibleCompanyIds()).resolves.toEqual([]);
    await expect(access.accessibleProjectIds()).resolves.toEqual([]);
    await expect(access.accessibleSiteIds()).resolves.toEqual([S2]);
  });

  it('merge several assignments without duplicates', async () => {
    const access = context(
      assignment('COMPANY', { companyId: C1 }, [MANAGE]),
      assignment('PROJECT', { projectId: P1 }, [MANAGE]),
      assignment('PROJECT', { projectId: P3 }, [MANAGE]),
    );

    const projects = await access.accessibleProjectIds();

    expect([...(projects ?? [])].sort()).toEqual([P1, P2, P3]);
  });

  it('can be limited to the assignments that grant one permission', async () => {
    const access = context(
      assignment('COMPANY', { companyId: C1 }, ['masters.projects.view']),
      assignment('COMPANY', { companyId: C2 }, [MANAGE]),
    );

    await expect(access.accessibleCompanyIds(MANAGE)).resolves.toEqual([C2]);
    await expect(access.accessibleCompanyIds()).resolves.toEqual([C1, C2]);
  });

  it('context lists add the parents of a site or project assignment (so a switcher has something to pick)', async () => {
    const access = context(assignment('SITE', { siteId: S3 }, [MANAGE]));

    await expect(access.contextProjectIds()).resolves.toEqual([P3]);
    await expect(access.contextCompanyIds()).resolves.toEqual([C2]);
  });
});
