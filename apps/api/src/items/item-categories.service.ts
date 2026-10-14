import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateItemCategoryRequest,
  ItemCategoryListQuery,
  ItemCategoryOptionsResponse,
  ItemCategoryResponse,
  PagedItemCategoriesResponse,
  UpdateItemCategoryRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { ITEM_CATEGORY_SERIES, nextCode } from '../masters/code-series';
import { hasActiveChildren } from '../masters/hierarchy-errors';
import { notFound, pageOf } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanManageItems, assertCanViewItems, canManageItems } from './item-access';
import { toItemCategoryAuditSnapshot, toItemCategoryResponse } from './item-categories.mapper';
import { duplicateName, guardUnique } from './item-errors';

const ENTITY = 'Category';

@Injectable()
export class ItemCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ItemCategoryListQuery,
    access: AccessContext,
  ): Promise<PagedItemCategoriesResponse> {
    assertCanViewItems(access);

    const where: Prisma.ItemCategoryWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    const [total, categories] = await Promise.all([
      this.prisma.itemCategory.count({ where }),
      this.prisma.itemCategory.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const manage = canManageItems(access);

    return pageOf(
      categories.map((category) => toItemCategoryResponse(category, manage)),
      total,
      query,
    );
  }

  /** Active categories for the item form pick list (label = name, as the client calls them). */
  async options(access: AccessContext): Promise<ItemCategoryOptionsResponse> {
    assertCanManageItems(access);

    const categories = await this.prisma.itemCategory.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });

    return { items: categories.map((category) => ({ id: category.id, label: category.name })) };
  }

  async get(id: string, access: AccessContext): Promise<ItemCategoryResponse> {
    assertCanViewItems(access);

    const category = await this.prisma.itemCategory.findUnique({ where: { id } });

    if (category === null) {
      throw notFound(ENTITY);
    }

    return toItemCategoryResponse(category, canManageItems(access));
  }

  async create(
    request: CreateItemCategoryRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemCategoryResponse> {
    assertCanManageItems(access);
    await this.assertNameFree(request.name);

    const created = await guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const code = await nextCode(tx, ITEM_CATEGORY_SERIES);
        const category = await tx.itemCategory.create({
          data: { code, name: request.name, createdById: actorId, updatedById: actorId },
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'ItemCategory',
          entityId: category.id,
          before: null,
          after: toItemCategoryAuditSnapshot(category),
        });

        return category;
      }),
    );

    return toItemCategoryResponse(created, true);
  }

  async update(
    id: string,
    request: UpdateItemCategoryRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemCategoryResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.name === request.name) {
      return toItemCategoryResponse(existing, true);
    }

    await this.assertNameFree(request.name, id);

    const updated = await guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const category = await tx.itemCategory.update({
          where: { id },
          data: { name: request.name, updatedById: actorId },
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'ItemCategory',
          entityId: id,
          before: toItemCategoryAuditSnapshot(existing),
          after: toItemCategoryAuditSnapshot(category),
        });

        return category;
      }),
    );

    return toItemCategoryResponse(updated, true);
  }

  async deactivate(
    id: string,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemCategoryResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(
    id: string,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemCategoryResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemCategoryResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toItemCategoryResponse(existing, true);
    }

    if (!isActive) {
      const activeItems = await this.prisma.item.count({
        where: { categoryId: id, isActive: true },
      });

      if (activeItems > 0) {
        throw hasActiveChildren('items');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const category = await tx.itemCategory.update({
        where: { id },
        data: { isActive, updatedById: actorId },
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, category.isActive),
        entityType: 'ItemCategory',
        entityId: id,
        before: toItemCategoryAuditSnapshot(existing),
        after: toItemCategoryAuditSnapshot(category),
      });

      return category;
    });

    return toItemCategoryResponse(updated, true);
  }

  private async requireManageable(id: string, access: AccessContext) {
    assertCanManageItems(access);

    const category = await this.prisma.itemCategory.findUnique({ where: { id } });

    if (category === null) {
      throw notFound(ENTITY);
    }

    return category;
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const same = await this.prisma.itemCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateName();
    }
  }
}
