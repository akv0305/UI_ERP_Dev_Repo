import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessContext,
  covers,
  isEffective,
  type AccessAssignment,
  type AccessLookup,
} from './access-context';

/** Assignment rows with everything the access rules and the readable /auth/me output need. */
export const assignmentInclude = {
  role: { include: { permissions: true } },
  company: true,
  project: true,
  site: true,
} satisfies Prisma.UserRoleInclude;

export type AssignmentRow = Prisma.UserRoleGetPayload<{ include: typeof assignmentInclude }>;

export function toAccessAssignment(row: AssignmentRow): AccessAssignment {
  return {
    scopeType: row.scopeType,
    companyId: row.companyId,
    projectId: row.projectId,
    siteId: row.siteId,
    role: {
      code: row.role.code,
      isActive: row.role.isActive,
      permissions: row.role.permissions.map((permission) => permission.permissionCode),
    },
  };
}

export interface UserCoveringRole {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
}

/**
 * Entry point of the access rules. The per-request data (the user's assignments) is loaded by the
 * request's own session lookup (AuthService.resolveSession) on EVERY request and handed to
 * `forAssignments`, so permissions are never cached in the session or between requests.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Builds the access object for one request from freshly loaded assignment rows. */
  forAssignments(rows: readonly AssignmentRow[]): AccessContext {
    return new AccessContext(rows.map(toAccessAssignment), this.lookup());
  }

  /** Same, from already-mapped assignments (tests, scripts). */
  forMapped(assignments: readonly AccessAssignment[]): AccessContext {
    return new AccessContext(assignments, this.lookup());
  }

  /**
   * Active users holding the role on GLOBAL scope, on the project's company, or on the project itself
   * (groundwork for approval routing; there is no UI yet). Site-scoped holders are not included:
   * a site assignment does not cover the whole project.
   */
  async findUsersWithRoleCovering(
    roleCode: string,
    projectId: string,
  ): Promise<UserCoveringRole[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true },
    });

    if (project === null) {
      return [];
    }

    const rows = await this.prisma.userRole.findMany({
      where: {
        role: { code: roleCode, isActive: true },
        user: { isActive: true },
        OR: [
          { scopeType: 'GLOBAL' },
          { scopeType: 'COMPANY', companyId: project.companyId },
          { scopeType: 'PROJECT', projectId },
        ],
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, email: true } },
        role: { include: { permissions: true } },
      },
      orderBy: [{ user: { username: 'asc' } }],
    });

    const target = {
      global: false,
      companyId: project.companyId,
      projectId,
      siteId: null,
      storeId: null,
    };
    const found = new Map<string, UserCoveringRole>();

    for (const row of rows) {
      const assignment = toAccessAssignment({
        ...row,
        company: null,
        project: null,
        site: null,
      } as AssignmentRow);

      // Defence in depth: the same rules the request checks use, so a role such as ADMINISTRATOR
      // that only counts at GLOBAL scope is not reported from a narrower assignment.
      if (isEffective(assignment) && covers(assignment, target) && !found.has(row.user.id)) {
        found.set(row.user.id, row.user);
      }
    }

    return [...found.values()];
  }

  private lookup(): AccessLookup {
    const prisma = this.prisma;

    return {
      projectsOfCompanies: async (companyIds) =>
        (
          await prisma.project.findMany({
            where: { companyId: { in: companyIds } },
            select: { id: true },
          })
        ).map((row) => row.id),
      sitesOfProjects: async (projectIds) =>
        (
          await prisma.site.findMany({
            where: { projectId: { in: projectIds } },
            select: { id: true },
          })
        ).map((row) => row.id),
      companiesOfProjects: async (projectIds) =>
        (
          await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { companyId: true },
            distinct: ['companyId'],
          })
        ).map((row) => row.companyId),
      projectsOfSites: async (siteIds) =>
        (
          await prisma.site.findMany({
            where: { id: { in: siteIds } },
            select: { projectId: true },
            distinct: ['projectId'],
          })
        ).map((row) => row.projectId),
      companyOfProject: async (projectId) =>
        (
          await prisma.project.findUnique({
            where: { id: projectId },
            select: { companyId: true },
          })
        )?.companyId ?? null,
      parentsOfSite: async (siteId) => {
        const site = await prisma.site.findUnique({
          where: { id: siteId },
          select: { projectId: true, project: { select: { companyId: true } } },
        });

        return site === null
          ? null
          : { projectId: site.projectId, companyId: site.project.companyId };
      },
      parentsOfStore: async (storeId) => {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: {
            siteId: true,
            site: { select: { projectId: true, project: { select: { companyId: true } } } },
          },
        });

        return store === null
          ? null
          : {
              siteId: store.siteId,
              projectId: store.site.projectId,
              companyId: store.site.project.companyId,
            };
      },
    };
  }
}
