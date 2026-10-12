import { jest } from '@jest/globals';
import { AccessContext, type AccessAssignment, type AccessLookup } from '../access/access-context';
import { ApiError } from '../common/errors/api-error';

export interface Write {
  table: string;
  data: unknown;
}

/**
 * Collects writes made through a transaction client and keeps them only when the transaction
 * callback resolves, as a real database would. Used by master-data service specs.
 */
export class TransactionRecorder {
  readonly committed: Write[] = [];
  private pending: Write[] = [];

  /** A write method on the transaction client; resolves with `result()` (or undefined). */
  write(table: string, result?: (arg: unknown) => unknown) {
    return jest.fn(async (arg: unknown) => {
      this.pending.push({ table, data: arg });

      return result?.(arg);
    });
  }

  /** Implementation for `prisma.$transaction(callback)`. */
  run<TTx>(tx: TTx) {
    return async (callback: (client: TTx) => Promise<unknown>) => {
      this.pending = [];
      const result = await callback(tx);
      this.committed.push(...this.pending);

      return result;
    };
  }

  tables(): string[] {
    return this.committed.map((entry) => entry.table);
  }

  audit(): Record<string, unknown>[] {
    return this.committed
      .filter((entry) => entry.table === 'auditEvent.create')
      .map((entry) => (entry.data as { data: Record<string, unknown> }).data);
  }
}

export async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);

    return ((error as ApiError).getResponse() as { code: string }).code;
  }

  return undefined;
}

// ---------- Access fixtures for scope tests ----------

/** Parent links of a fixture hierarchy: project -> company, site -> project, store -> site. */
export interface Hierarchy {
  projectCompany: Record<string, string>;
  siteProject: Record<string, string>;
  storeSite: Record<string, string>;
}

export const EMPTY_HIERARCHY: Hierarchy = { projectCompany: {}, siteProject: {}, storeSite: {} };

export function hierarchyLookup(h: Hierarchy = EMPTY_HIERARCHY): AccessLookup {
  const projectsOf = (companyIds: string[]) =>
    Object.keys(h.projectCompany).filter((p) => companyIds.includes(h.projectCompany[p] as string));

  return {
    projectsOfCompanies: (ids) => Promise.resolve(projectsOf(ids)),
    sitesOfProjects: (ids) =>
      Promise.resolve(
        Object.keys(h.siteProject).filter((s) => ids.includes(h.siteProject[s] as string)),
      ),
    companiesOfProjects: (ids) =>
      Promise.resolve([...new Set(ids.map((p) => h.projectCompany[p] as string))]),
    projectsOfSites: (ids) =>
      Promise.resolve([...new Set(ids.map((s) => h.siteProject[s] as string))]),
    companyOfProject: (id) => Promise.resolve(h.projectCompany[id] ?? null),
    parentsOfSite: (id) => {
      const projectId = h.siteProject[id];

      return Promise.resolve(
        projectId === undefined
          ? null
          : { projectId, companyId: h.projectCompany[projectId] as string },
      );
    },
    parentsOfStore: (id) => {
      const siteId = h.storeSite[id];

      if (siteId === undefined) {
        return Promise.resolve(null);
      }

      const projectId = h.siteProject[siteId] as string;

      return Promise.resolve({
        siteId,
        projectId,
        companyId: h.projectCompany[projectId] as string,
      });
    },
  };
}

/** Access of an unrestricted user (GLOBAL ADMINISTRATOR). */
export function globalAccess(): AccessContext {
  return new AccessContext(
    [
      {
        scopeType: 'GLOBAL',
        companyId: null,
        projectId: null,
        siteId: null,
        role: { code: 'ADMINISTRATOR', isActive: true, permissions: [] },
      },
    ],
    hierarchyLookup(),
  );
}

/** Access of a user holding one role (with the given permissions) at one scope. */
export function scopedAccess(
  scopeType: AccessAssignment['scopeType'],
  target: { companyId?: string; projectId?: string; siteId?: string },
  permissions: AccessAssignment['role']['permissions'],
  hierarchy: Hierarchy = EMPTY_HIERARCHY,
): AccessContext {
  return new AccessContext(
    [
      {
        scopeType,
        companyId: target.companyId ?? null,
        projectId: target.projectId ?? null,
        siteId: target.siteId ?? null,
        role: { code: 'CUSTOM', isActive: true, permissions },
      },
    ],
    hierarchyLookup(hierarchy),
  );
}
