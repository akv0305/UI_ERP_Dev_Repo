import {
  ADMINISTRATOR_ROLE_CODE,
  ADMIN_PERMISSION_PREFIX,
  ALL_PERMISSIONS,
  type Permission,
  type RoleScopeType,
} from '@uie/contracts';

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

/** One role grant of the signed-in user, with the role's permissions already loaded. */
export interface AccessAssignment {
  scopeType: RoleScopeType;
  companyId: string | null;
  projectId: string | null;
  siteId: string | null;
  role: { code: string; isActive: boolean; permissions: readonly string[] };
}

/** What a permission is checked against. Exactly one field is expected; `global` means "not tied to a record". */
export type AccessTarget =
  | { global: true }
  | { companyId: string }
  | { projectId: string }
  | { siteId: string }
  | { storeId: string };

/** A target with its ancestors filled in, so any assignment can be compared by one id. */
export interface ResolvedTarget {
  global: boolean;
  companyId: string | null;
  projectId: string | null;
  siteId: string | null;
  storeId: string | null;
}

/** Hierarchy lookups the access rules need. Implemented over Prisma; faked in tests. */
export interface AccessLookup {
  projectsOfCompanies(companyIds: string[]): Promise<string[]>;
  sitesOfProjects(projectIds: string[]): Promise<string[]>;
  companiesOfProjects(projectIds: string[]): Promise<string[]>;
  projectsOfSites(siteIds: string[]): Promise<string[]>;
  companyOfProject(projectId: string): Promise<string | null>;
  parentsOfSite(siteId: string): Promise<{ projectId: string; companyId: string } | null>;
  parentsOfStore(
    storeId: string,
  ): Promise<{ siteId: string; projectId: string; companyId: string } | null>;
}

/**
 * Hierarchy: GLOBAL covers company covers project covers site covers store.
 * A target with no id at the assignment's level (for example a company target against a project
 * assignment) is not covered: access only ever flows downwards.
 */
export function covers(
  assignment: Pick<AccessAssignment, 'scopeType' | 'companyId' | 'projectId' | 'siteId'>,
  target: ResolvedTarget,
): boolean {
  switch (assignment.scopeType) {
    case 'GLOBAL':
      return true;
    case 'COMPANY':
      return assignment.companyId !== null && target.companyId === assignment.companyId;
    case 'PROJECT':
      return assignment.projectId !== null && target.projectId === assignment.projectId;
    case 'SITE':
      return assignment.siteId !== null && target.siteId === assignment.siteId;
    default:
      return false;
  }
}

/** An assignment counts only while its role is active; ADMINISTRATOR counts only at GLOBAL scope. */
export function isEffective(assignment: AccessAssignment): boolean {
  if (!assignment.role.isActive) {
    return false;
  }

  return !(assignment.role.code === ADMINISTRATOR_ROLE_CODE && assignment.scopeType !== 'GLOBAL');
}

/**
 * Permissions one assignment grants. ADMINISTRATOR grants everything (at GLOBAL only);
 * "administration." permissions are granted only by GLOBAL assignments.
 */
export function permissionsOf(assignment: AccessAssignment): Permission[] {
  if (!isEffective(assignment)) {
    return [];
  }

  const granted =
    assignment.role.code === ADMINISTRATOR_ROLE_CODE
      ? [...ALL_PERMISSIONS]
      : ALL_PERMISSIONS.filter(
          (code) => KNOWN_PERMISSIONS.has(code) && assignment.role.permissions.includes(code),
        );

  return assignment.scopeType === 'GLOBAL'
    ? granted
    : granted.filter((code) => !code.startsWith(ADMIN_PERMISSION_PREFIX));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * The signed-in user's access for ONE request. It is built from the assignments loaded by the
 * request's own database read, so nothing here outlives the request or is cached in the session.
 * Hierarchy lookups are memoised for the lifetime of the object.
 */
export class AccessContext {
  private readonly targets = new Map<string, Promise<ResolvedTarget>>();
  private readonly expansions = new Map<string, Promise<string[] | null>>();

  constructor(
    readonly assignments: readonly AccessAssignment[],
    private readonly lookup: AccessLookup,
  ) {}

  /** Union of permissions over all active-role assignments (administration.* only from GLOBAL). */
  menuPermissions(): Permission[] {
    const granted = new Set<string>();

    for (const assignment of this.assignments) {
      for (const code of permissionsOf(assignment)) {
        granted.add(code);
      }
    }

    return ALL_PERMISSIONS.filter((code) => granted.has(code));
  }

  /** True when some assignment that grants the permission covers the target. */
  async can(permission: Permission, target: AccessTarget): Promise<boolean> {
    const holders = this.holdersOf(permission);

    if (holders.length === 0) {
      return false;
    }

    // administration.* permissions are global-only, whatever the target.
    if (permission.startsWith(ADMIN_PERMISSION_PREFIX)) {
      return holders.some((assignment) => assignment.scopeType === 'GLOBAL');
    }

    const resolved = await this.resolve(target);

    return holders.some((assignment) => covers(assignment, resolved));
  }

  /** Company ids the user's assignments cover (for list filtering); null = unrestricted. */
  async accessibleCompanyIds(permission?: Permission): Promise<string[] | null> {
    const relevant = this.relevant(permission);

    if (relevant.some((assignment) => assignment.scopeType === 'GLOBAL')) {
      return null;
    }

    return unique(
      relevant.flatMap((assignment) =>
        assignment.scopeType === 'COMPANY' && assignment.companyId !== null
          ? [assignment.companyId]
          : [],
      ),
    );
  }

  /** Project ids the user's assignments cover; null = unrestricted. */
  accessibleProjectIds(permission?: Permission): Promise<string[] | null> {
    return this.memo(`projects:${permission ?? '*'}`, async () => {
      const relevant = this.relevant(permission);

      if (relevant.some((assignment) => assignment.scopeType === 'GLOBAL')) {
        return null;
      }

      const direct = relevant.flatMap((assignment) =>
        assignment.scopeType === 'PROJECT' && assignment.projectId !== null
          ? [assignment.projectId]
          : [],
      );
      const companyIds = (await this.accessibleCompanyIds(permission)) ?? [];
      const viaCompany =
        companyIds.length === 0 ? [] : await this.lookup.projectsOfCompanies(companyIds);

      return unique([...direct, ...viaCompany]);
    });
  }

  /** Site ids the user's assignments cover; null = unrestricted. */
  accessibleSiteIds(permission?: Permission): Promise<string[] | null> {
    return this.memo(`sites:${permission ?? '*'}`, async () => {
      const relevant = this.relevant(permission);

      if (relevant.some((assignment) => assignment.scopeType === 'GLOBAL')) {
        return null;
      }

      const direct = relevant.flatMap((assignment) =>
        assignment.scopeType === 'SITE' && assignment.siteId !== null ? [assignment.siteId] : [],
      );
      const projectIds = (await this.accessibleProjectIds(permission)) ?? [];
      const viaProject =
        projectIds.length === 0 ? [] : await this.lookup.sitesOfProjects(projectIds);

      return unique([...direct, ...viaProject]);
    });
  }

  /**
   * Projects the user may choose as working context: those covered, plus the projects that contain
   * a site they are assigned to. null = unrestricted.
   */
  contextProjectIds(): Promise<string[] | null> {
    return this.memo('context:projects', async () => {
      const covered = await this.accessibleProjectIds();

      if (covered === null) {
        return null;
      }

      const siteIds = this.relevant().flatMap((assignment) =>
        assignment.scopeType === 'SITE' && assignment.siteId !== null ? [assignment.siteId] : [],
      );
      const viaSites = siteIds.length === 0 ? [] : await this.lookup.projectsOfSites(siteIds);

      return unique([...covered, ...viaSites]);
    });
  }

  /** Companies the user may choose as working context: those covered plus the parents of context projects. */
  contextCompanyIds(): Promise<string[] | null> {
    return this.memo('context:companies', async () => {
      const covered = await this.accessibleCompanyIds();

      if (covered === null) {
        return null;
      }

      const projectIds = (await this.contextProjectIds()) ?? [];
      const parents =
        projectIds.length === 0 ? [] : await this.lookup.companiesOfProjects(projectIds);

      return unique([...covered, ...parents]);
    });
  }

  /** Assignments whose role grants the permission. */
  private holdersOf(permission: Permission): AccessAssignment[] {
    return this.assignments.filter((assignment) => permissionsOf(assignment).includes(permission));
  }

  private relevant(permission?: Permission): AccessAssignment[] {
    return permission === undefined
      ? this.assignments.filter(isEffective)
      : this.holdersOf(permission);
  }

  private resolve(target: AccessTarget): Promise<ResolvedTarget> {
    return this.memoTarget(JSON.stringify(target), async () => {
      const blank: ResolvedTarget = {
        global: false,
        companyId: null,
        projectId: null,
        siteId: null,
        storeId: null,
      };

      if ('global' in target) {
        return { ...blank, global: true };
      }

      if ('companyId' in target) {
        return { ...blank, companyId: target.companyId };
      }

      if ('projectId' in target) {
        return {
          ...blank,
          projectId: target.projectId,
          companyId: await this.lookup.companyOfProject(target.projectId),
        };
      }

      if ('siteId' in target) {
        const parents = await this.lookup.parentsOfSite(target.siteId);

        return { ...blank, siteId: target.siteId, ...parents };
      }

      const parents = await this.lookup.parentsOfStore(target.storeId);

      return { ...blank, storeId: target.storeId, ...parents };
    });
  }

  private memoTarget(key: string, load: () => Promise<ResolvedTarget>): Promise<ResolvedTarget> {
    const cached = this.targets.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const created = load();

    this.targets.set(key, created);

    return created;
  }

  private memo(key: string, load: () => Promise<string[] | null>): Promise<string[] | null> {
    const cached = this.expansions.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const created = load();

    this.expansions.set(key, created);

    return created;
  }
}
