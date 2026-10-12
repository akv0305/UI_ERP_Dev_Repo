import { Injectable } from '@nestjs/common';
import type {
  CreateStoreRequest,
  StoreListResponse,
  StoreResponse,
  UpdateStoreRequest,
} from '@uie/contracts';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { parentInactive } from '../masters/hierarchy-errors';
import {
  assertCodeUnchanged,
  duplicateCode,
  isUniqueViolation,
  notFound,
} from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  storeInclude,
  toStoreAuditSnapshot,
  toStoreResponse,
  type StoreWithRelations,
} from './sites.mapper';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForSite(siteId: string): Promise<StoreListResponse> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });

    if (site === null) {
      throw notFound('Site');
    }

    const stores = await this.prisma.store.findMany({
      where: { siteId },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });

    return { items: stores.map(toStoreResponse) };
  }

  async create(
    siteId: string,
    request: CreateStoreRequest,
    actorId: string,
  ): Promise<StoreResponse> {
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

    return toStoreResponse(created);
  }

  async update(id: string, request: UpdateStoreRequest, actorId: string): Promise<StoreResponse> {
    const existing = await this.require(id);

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

    return toStoreResponse(updated);
  }

  deactivate(id: string, actorId: string): Promise<StoreResponse> {
    return this.setActive(id, false, actorId);
  }

  reactivate(id: string, actorId: string): Promise<StoreResponse> {
    return this.setActive(id, true, actorId);
  }

  private async setActive(id: string, isActive: boolean, actorId: string): Promise<StoreResponse> {
    const existing = await this.require(id);

    if (existing.isActive === isActive) {
      return toStoreResponse(existing);
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

    return toStoreResponse(updated);
  }

  private async require(id: string): Promise<StoreWithRelations> {
    const store = await this.prisma.store.findUnique({ where: { id }, include: storeInclude });

    if (store === null) {
      throw notFound('Store');
    }

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
