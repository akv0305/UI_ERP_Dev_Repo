import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateProjectRequest,
  PagedProjectsResponse,
  ProjectListQuery,
  ProjectOptionsResponse,
  ProjectResponse,
  UpdateProjectRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import {
  hasActiveChildren,
  invalidGstRegistration,
  parentInactive,
} from '../masters/hierarchy-errors';
import {
  assertCodeUnchanged,
  duplicateCode,
  isUniqueViolation,
  notFound,
  pageOf,
} from '../masters/master-helpers';
import {
  PROJECT_PERMISSIONS,
  SITE_PERMISSIONS,
  assertManageable,
  assertVisible,
  canManage,
  forbidden,
  idFilter,
} from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import {
  projectInclude,
  toProjectAuditSnapshot,
  toProjectResponse,
  type ProjectWithRelations,
} from './projects.mapper';

const ENTITY = 'Project';

/** A project row carries its company, so its scope target needs no extra lookup. */
function targetOf(project: { id: string; companyId: string }) {
  return { companyId: project.companyId, projectId: project.id };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProjectListQuery, access: AccessContext): Promise<PagedProjectsResponse> {
    const visible = await access.accessibleProjectIds([
      PROJECT_PERMISSIONS.view,
      PROJECT_PERMISSIONS.manage,
    ]);
    const where: Prisma.ProjectWhereInput = { id: idFilter(visible) };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.companyId !== undefined) {
      where.companyId = query.companyId;
    }

    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      projects.map((project) =>
        toProjectResponse(project, canManage(access, PROJECT_PERMISSIONS, targetOf(project))),
      ),
      total,
      query,
    );
  }

  /**
   * Active projects the user may create a site under (masters.sitesAndStores.manage over the
   * project). Needs only that permission, not projects.view.
   */
  async optionsForSites(access: AccessContext): Promise<ProjectOptionsResponse> {
    const covered = await access.accessibleProjectIds(SITE_PERMISSIONS.manage);
    const projects = await this.prisma.project.findMany({
      where: { isActive: true, id: idFilter(covered) },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, companyId: true },
    });

    return {
      items: projects.map((project) => ({
        id: project.id,
        label: codeLabel(project.code, project.name),
        companyId: project.companyId,
      })),
    };
  }

  async get(id: string, access: AccessContext): Promise<ProjectResponse> {
    const project = await this.require(id);

    assertVisible(access, PROJECT_PERMISSIONS, targetOf(project), ENTITY);

    return toProjectResponse(project, canManage(access, PROJECT_PERMISSIONS, targetOf(project)));
  }

  async create(
    request: CreateProjectRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ProjectResponse> {
    // Scope is checked before the company is looked up, so an out-of-scope or unknown company
    // gives the same answer and existence is not revealed.
    if (!(await access.can(PROJECT_PERMISSIONS.manage, { companyId: request.companyId }))) {
      throw forbidden();
    }

    const company = await this.prisma.company.findUnique({
      where: { id: request.companyId },
      select: { id: true, isActive: true },
    });

    if (company === null) {
      throw notFound('Company');
    }

    if (!company.isActive) {
      throw parentInactive('company');
    }

    await this.assertCodeFree(request.companyId, request.code);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId);
    }

    await this.assertBillingGst(request.companyId, request.billingGstRegistrationId, null);

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { ...request, createdById: actorId, updatedById: actorId },
          include: projectInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Project',
          entityId: project.id,
          companyId: project.companyId,
          before: null,
          after: toProjectAuditSnapshot(project),
        });

        return project;
      }),
    );

    return toProjectResponse(created, true);
  }

  async update(
    id: string,
    request: UpdateProjectRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ProjectResponse> {
    const existing = await this.requireManageable(id, access);

    assertCodeUnchanged(request.code, existing.code);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId, existing.stateId);
    }

    await this.assertBillingGst(
      existing.companyId,
      request.billingGstRegistrationId,
      existing.billingGstRegistrationId,
    );

    // The company and code are fixed at creation, so only these fields are written.
    const data = {
      name: request.name,
      stateId: request.stateId,
      billingGstRegistrationId: request.billingGstRegistrationId,
      updatedById: actorId,
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data,
        include: projectInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Project',
        entityId: id,
        companyId: existing.companyId,
        before: toProjectAuditSnapshot(existing),
        after: toProjectAuditSnapshot(project),
      });

      return project;
    });

    return toProjectResponse(updated, true);
  }

  deactivate(id: string, actorId: string, access: AccessContext): Promise<ProjectResponse> {
    return this.setActive(id, false, actorId, access);
  }

  reactivate(id: string, actorId: string, access: AccessContext): Promise<ProjectResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<ProjectResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toProjectResponse(existing, true);
    }

    if (isActive && !existing.company.isActive) {
      throw parentInactive('company');
    }

    if (!isActive) {
      const activeSites = await this.prisma.site.count({
        where: { projectId: id, isActive: true },
      });

      if (activeSites > 0) {
        throw hasActiveChildren('sites');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: projectInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, project.isActive),
        entityType: 'Project',
        entityId: id,
        companyId: existing.companyId,
        before: toProjectAuditSnapshot(existing),
        after: toProjectAuditSnapshot(project),
      });

      return project;
    });

    return toProjectResponse(updated, true);
  }

  private async require(id: string): Promise<ProjectWithRelations> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });

    if (project === null) {
      throw notFound(ENTITY);
    }

    return project;
  }

  /** The record, once the user is known to be allowed to change it (404 out of scope, 403 view-only). */
  private async requireManageable(
    id: string,
    access: AccessContext,
  ): Promise<ProjectWithRelations> {
    const project = await this.require(id);

    assertManageable(access, PROJECT_PERMISSIONS, targetOf(project), ENTITY);

    return project;
  }

  private async assertCodeFree(companyId: string, code: string): Promise<void> {
    const same = await this.prisma.project.findFirst({
      where: { companyId, code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateCode();
    }
  }

  /**
   * The billing registration must be an active one of the same company. A project may keep a
   * registration it already has (`currentId`) even if that was deactivated since.
   */
  private async assertBillingGst(
    companyId: string,
    registrationId: string | null,
    currentId: string | null,
  ): Promise<void> {
    if (registrationId === null) {
      return;
    }

    const registration = await this.prisma.companyGstRegistration.findUnique({
      where: { id: registrationId },
      select: { companyId: true, isActive: true },
    });

    if (
      registration === null ||
      registration.companyId !== companyId ||
      (!registration.isActive && registrationId !== currentId)
    ) {
      throw invalidGstRegistration();
    }
  }

  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw isUniqueViolation(error) ? duplicateCode() : error;
    }
  }
}
