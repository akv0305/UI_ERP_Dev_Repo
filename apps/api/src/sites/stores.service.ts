import { Injectable } from '@nestjs/common';
import type {
  CreateStoreRequest,
  StoreListResponse,
  StoreResponse,
  UpdateStoreRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { parentInactive } from '../masters/hierarchy-errors';
import {
  assertCodeUnchanged,
  duplicateCode,
  isUniqueViolation,
  notFound,
} from '../masters/master-helpers';
import {
  SITE_PERMISSIONS,
  assertManageable,
  assertVisible,
  canManage,
  forbidden,
} from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  storeInclude,
  toStoreAuditSnapshot,
  toStoreResponse,
  type StoreWithRelations,
} from './sites.mapper';

/** A store row carries its site, project and company, so its scope target needs no extra lookup. */
function targetOf(store: StoreWithRelations) {
  return {
    companyId: store.site.project.companyId,
    projectId: store.site.projectId,
    siteId: store.siteId,
    storeId: store.id,
  };
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForSite(siteId: string, access: AccessContext): Promise<StoreListResponse> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, projectId: true, project: { select: { companyId: true } } },
    });

    if (site === null) {
      throw notFound('Site');
    }

    const siteTarget = {
      companyId: site.project.companyId,
      projectId: site.projectId,
      siteId: site.id,
    };

    assertVisible(access, SITE_PERMISSIONS, siteTarget, 'Site');

    const stores = await this.prisma.store.findMany({
      where: { siteId },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    const manageable = canManage(access, SITE_PERMISSIONS, siteTarget);

    return { items: stores.map((store) => toStoreResponse(store, manageable)) };
  }

  async create(
    siteId: string,
    request: CreateStoreRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<StoreResponse> {
    // Scope is checked before the site is looked up, so existence is not revealed.
    if (!(await access.can(SITE_PERMISSIONS.manage, { siteId }))) {
      throw forbidden();
    }

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, isActive: true, project: { select: { companyId: true } } },
    });

    if (site === null) {
      throw notFound('Site');
    }

    if (!site.isActive) {
      throw parentInactive('site');
    }

    const same = await this.prisma.store.findFirst({
      where: { siteId, code: { equals: request.code, mode: 'insensitive' } },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateCode();
    }

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: { ...request, siteId, createdById: actorId, updatedById: actorId },
          include: storeInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Store',
          entityId: store.id,
          companyId: site.project.companyId,
          before: null,
          after: toStoreAuditSnapshot(store),
        });

        return store;
      }),
    );

    return toStoreResponse(created, true);
  }

  async update(
    id: string,
    request: UpdateStoreRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<StoreResponse> {
    const existing = await this.requireManageable(id, access);

    assertCodeUnchanged(request.code, existing.code);

    const updated = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.update({
        where: { id },
        data: { name: request.name, updatedById: actorId },
        include: storeInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Store',
        entityId: id,
        companyId: existing.site.project.companyId,
        before: toStoreAuditSnapshot(existing),
        after: toStoreAuditSnapshot(store),
      });

      return store;
    });

    return toStoreResponse(updated, true);
  }

  deactivate(id: string, actorId: string, access: AccessContext): Promise<StoreResponse> {
    return this.setActive(id, false, actorId, access);
  }

  reactivate(id: string, actorId: string, access: AccessContext): Promise<StoreResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<StoreResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toStoreResponse(existing, true);
    }

    if (isActive && !existing.site.isActive) {
      throw parentInactive('site');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: storeInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, store.isActive),
        entityType: 'Store',
        entityId: id,
        companyId: existing.site.project.companyId,
        before: toStoreAuditSnapshot(existing),
        after: toStoreAuditSnapshot(store),
      });

      return store;
    });

    return toStoreResponse(updated, true);
  }

  /** The record, once the user is known to be allowed to change it (404 out of scope, 403 view-only). */
  private async requireManageable(id: string, access: AccessContext): Promise<StoreWithRelations> {
    const store = await this.prisma.store.findUnique({ where: { id }, include: storeInclude });

    if (store === null) {
      throw notFound('Store');
    }

    assertManageable(access, SITE_PERMISSIONS, targetOf(store), 'Store');

    return store;
  }

  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw isUniqueViolation(error) ? duplicateCode() : error;
    }
  }
}
