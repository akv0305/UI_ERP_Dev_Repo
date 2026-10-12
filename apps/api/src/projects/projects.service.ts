import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateProjectRequest,
  PagedProjectsResponse,
  ProjectListQuery,
  ProjectResponse,
  UpdateProjectRequest,
} from '@uie/contracts';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
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
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import {
  projectInclude,
  toProjectAuditSnapshot,
  toProjectResponse,
  type ProjectWithRelations,
} from './projects.mapper';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProjectListQuery): Promise<PagedProjectsResponse> {
    const where: Prisma.ProjectWhereInput = {};

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

    return pageOf(projects.map(toProjectResponse), total, query);
  }

  async get(id: string): Promise<ProjectResponse> {
    return toProjectResponse(await this.require(id));
  }

  async create(request: CreateProjectRequest, actorId: string): Promise<ProjectResponse> {
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

    return toProjectResponse(created);
  }

  async update(
    id: string,
    request: UpdateProjectRequest,
    actorId: string,
  ): Promise<ProjectResponse> {
    const existing = await this.require(id);

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

    return toProjectResponse(updated);
  }

  deactivate(id: string, actorId: string): Promise<ProjectResponse> {
    return this.setActive(id, false, actorId);
  }

  reactivate(id: string, actorId: string): Promise<ProjectResponse> {
    return this.setActive(id, true, actorId);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
  ): Promise<ProjectResponse> {
    const existing = await this.require(id);

    if (existing.isActive === isActive) {
      return toProjectResponse(existing);
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

    return toProjectResponse(updated);
  }

  private async require(id: string): Promise<ProjectWithRelations> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });

    if (project === null) {
      throw notFound('Project');
    }

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
