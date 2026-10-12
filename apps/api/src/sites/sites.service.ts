import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateSiteRequest,
  PagedSitesResponse,
  SiteListQuery,
  SiteResponse,
  UpdateSiteRequest,
} from '@uie/contracts';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { hasActiveChildren, parentInactive } from '../masters/hierarchy-errors';
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
  siteInclude,
  toSiteAuditSnapshot,
  toSiteResponse,
  type SiteWithRelations,
} from './sites.mapper';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async list(query: SiteListQuery): Promise<PagedSitesResponse> {
    const where: Prisma.SiteWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.projectId !== undefined) {
      where.projectId = query.projectId;
    }

    const [total, sites] = await Promise.all([
      this.prisma.site.count({ where }),
      this.prisma.site.findMany({
        where,
        include: siteInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(sites.map(toSiteResponse), total, query);
  }

  async get(id: string): Promise<SiteResponse> {
    return toSiteResponse(await this.require(id));
  }

  async create(request: CreateSiteRequest, actorId: string): Promise<SiteResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: request.projectId },
      select: { id: true, isActive: true },
    });

    if (project === null) {
      throw notFound('Project');
    }

    if (!project.isActive) {
      throw parentInactive('project');
    }

    await this.assertCodeFree(request.projectId, request.code);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId);
    }

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const site = await tx.site.create({
          data: { ...request, createdById: actorId, updatedById: actorId },
          include: siteInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Site',
          entityId: site.id,
          companyId: site.project.companyId,
          before: null,
          after: toSiteAuditSnapshot(site),
        });

        return site;
      }),
    );

    return toSiteResponse(created);
  }

  async update(id: string, request: UpdateSiteRequest, actorId: string): Promise<SiteResponse> {
    const existing = await this.require(id);

    assertCodeUnchanged(request.code, existing.code);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId, existing.stateId);
    }

    // The project and code are fixed at creation, so only these fields are written.
    const data = {
      name: request.name,
      addressLine1: request.addressLine1,
      addressLine2: request.addressLine2,
      city: request.city,
      stateId: request.stateId,
      pinCode: request.pinCode,
      contactPerson: request.contactPerson,
      contactPhone: request.contactPhone,
      updatedById: actorId,
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const site = await tx.site.update({
        where: { id },
        data,
        include: siteInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Site',
        entityId: id,
        companyId: existing.project.companyId,
        before: toSiteAuditSnapshot(existing),
        after: toSiteAuditSnapshot(site),
      });

      return site;
    });

    return toSiteResponse(updated);
  }

  deactivate(id: string, actorId: string): Promise<SiteResponse> {
    return this.setActive(id, false, actorId);
  }

  reactivate(id: string, actorId: string): Promise<SiteResponse> {
    return this.setActive(id, true, actorId);
  }

  private async setActive(id: string, isActive: boolean, actorId: string): Promise<SiteResponse> {
    const existing = await this.require(id);

    if (existing.isActive === isActive) {
      return toSiteResponse(existing);
    }

    if (isActive && !existing.project.isActive) {
      throw parentInactive('project');
    }

    if (!isActive) {
      const activeStores = await this.prisma.store.count({ where: { siteId: id, isActive: true } });

      if (activeStores > 0) {
        throw hasActiveChildren('stores');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const site = await tx.site.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: siteInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, site.isActive),
        entityType: 'Site',
        entityId: id,
        companyId: existing.project.companyId,
        before: toSiteAuditSnapshot(existing),
        after: toSiteAuditSnapshot(site),
      });

      return site;
    });

    return toSiteResponse(updated);
  }

  private async require(id: string): Promise<SiteWithRelations> {
    const site = await this.prisma.site.findUnique({ where: { id }, include: siteInclude });

    if (site === null) {
      throw notFound('Site');
    }

    return site;
  }

  private async assertCodeFree(projectId: string, code: string): Promise<void> {
    const same = await this.prisma.site.findFirst({
      where: { projectId, code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateCode();
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
