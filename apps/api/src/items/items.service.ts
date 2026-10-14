import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ApproveItemRequest,
  CreateItemRequest,
  ItemListQuery,
  ItemResponse,
  ItemStatus,
  PagedItemsResponse,
  RejectItemRequest,
  ReopenItemRequest,
  UpdateItemRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { ITEM_SERIES, lockSeries, nextCode } from '../masters/code-series';
import { parentInactive } from '../masters/hierarchy-errors';
import { notFound, pageOf } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  EDITABLE_ITEM_STATUSES,
  assertCanApproveItems,
  assertCanManageItems,
  assertCanViewItems,
  itemFlagsFor,
} from './item-access';
import { duplicateItem, invalidCategory, invalidStatus, invalidUnit } from './item-errors';
import {
  gstRateText,
  itemInclude,
  toItemAuditSnapshot,
  toItemResponse,
  type ItemWithRelations,
} from './items.mapper';

const ENTITY = 'Item';

type Tx = Prisma.TransactionClient;

function fieldsOf(request: CreateItemRequest) {
  return {
    description: request.description,
    size: request.size,
    categoryId: request.categoryId,
    unitId: request.unitId,
    itemUse: request.itemUse,
    hsnCode: request.hsnCode,
    gstRate: request.gstRate,
    remarks: request.remarks,
  };
}

function sameGstRate(current: Prisma.Decimal | null, requested: string | null): boolean {
  const next = requested === null ? null : Number(requested).toFixed(2);

  return gstRateText(current) === next;
}

function sameFields(item: ItemWithRelations, request: UpdateItemRequest): boolean {
  return (
    item.description === request.description &&
    item.size === request.size &&
    item.categoryId === request.categoryId &&
    item.unitId === request.unitId &&
    item.itemUse === request.itemUse &&
    item.hsnCode === request.hsnCode &&
    sameGstRate(item.gstRate, request.gstRate) &&
    item.remarks === request.remarks
  );
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ItemListQuery, access: AccessContext): Promise<PagedItemsResponse> {
    assertCanViewItems(access);

    const where: Prisma.ItemWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { size: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.categoryId !== undefined) {
      where.categoryId = query.categoryId;
    }

    if (query.unitId !== undefined) {
      where.unitId = query.unitId;
    }

    if (query.status !== undefined) {
      where.status = query.status;
    }

    if (query.itemUse !== undefined) {
      where.itemUse = query.itemUse;
    }

    const [total, items] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        include: itemInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      items.map((item) => toItemResponse(item, itemFlagsFor(access, item))),
      total,
      query,
    );
  }

  async get(id: string, access: AccessContext): Promise<ItemResponse> {
    assertCanViewItems(access);

    const item = await this.find(id);

    return toItemResponse(item, itemFlagsFor(access, item));
  }

  async create(
    request: CreateItemRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemResponse> {
    assertCanManageItems(access);
    await this.assertCategoryUsable(request.categoryId);
    await this.assertUnitUsable(request.unitId);

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, ITEM_SERIES);

      await this.assertNotDuplicate(tx, request);

      const item = await tx.item.create({
        data: { code, ...fieldsOf(request), createdById: actorId, updatedById: actorId },
        include: itemInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'CREATE',
        entityType: 'Item',
        entityId: item.id,
        before: null,
        after: toItemAuditSnapshot(item),
      });

      return item;
    });

    return toItemResponse(created, itemFlagsFor(access, created));
  }

  /** Only Draft or Rejected items can be edited; Approved items are locked until reopened. */
  async update(
    id: string,
    request: UpdateItemRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemResponse> {
    assertCanManageItems(access);

    const existing = await this.find(id);

    this.assertEditable(existing);

    if (sameFields(existing, request)) {
      return toItemResponse(existing, itemFlagsFor(access, existing));
    }

    if (request.categoryId !== existing.categoryId) {
      await this.assertCategoryUsable(request.categoryId);
    }

    if (request.unitId !== existing.unitId) {
      await this.assertUnitUsable(request.unitId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockSeries(tx, ITEM_SERIES);
      await this.assertNotDuplicate(tx, request, id);

      const result = await tx.item.updateMany({
        where: { id, isActive: true, status: { in: [...EDITABLE_ITEM_STATUSES] } },
        data: { ...fieldsOf(request), updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidStatus('This item was changed by someone else. Reload and try again.');
      }

      const item = await tx.item.findUniqueOrThrow({ where: { id }, include: itemInclude });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Item',
        entityId: id,
        before: toItemAuditSnapshot(existing),
        after: toItemAuditSnapshot(item),
      });

      return item;
    });

    return toItemResponse(updated, itemFlagsFor(access, updated));
  }

  async submit(id: string, actorId: string, access: AccessContext): Promise<ItemResponse> {
    assertCanManageItems(access);

    return this.transition(id, EDITABLE_ITEM_STATUSES, actorId, access, {
      status: 'PENDING_APPROVAL',
      submittedAt: new Date(),
      submittedById: actorId,
      decidedAt: null,
      decidedById: null,
      decisionRemarks: null,
    });
  }

  /** Self-approval is allowed for items only (OQ-28); the Audit Log shows both actions. */
  async approve(
    id: string,
    request: ApproveItemRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemResponse> {
    assertCanApproveItems(access);

    return this.transition(id, ['PENDING_APPROVAL'], actorId, access, {
      status: 'APPROVED',
      decidedAt: new Date(),
      decidedById: actorId,
      decisionRemarks: request.remarks,
    });
  }

  async reject(
    id: string,
    request: RejectItemRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemResponse> {
    assertCanApproveItems(access);

    return this.transition(id, ['PENDING_APPROVAL'], actorId, access, {
      status: 'REJECTED',
      decidedAt: new Date(),
      decidedById: actorId,
      decisionRemarks: request.remarks,
    });
  }

  /** Approved -> Draft so the maker can edit; blocked for new documents until re-approved. */
  async reopen(
    id: string,
    request: ReopenItemRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemResponse> {
    assertCanApproveItems(access);

    return this.transition(id, ['APPROVED'], actorId, access, {
      status: 'DRAFT',
      submittedAt: null,
      submittedById: null,
      decidedAt: new Date(),
      decidedById: actorId,
      decisionRemarks: request.remarks,
    });
  }

  async deactivate(id: string, actorId: string, access: AccessContext): Promise<ItemResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(id: string, actorId: string, access: AccessContext): Promise<ItemResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async transition(
    id: string,
    from: readonly ItemStatus[],
    actorId: string,
    access: AccessContext,
    data: Prisma.ItemUncheckedUpdateManyInput,
  ): Promise<ItemResponse> {
    const existing = await this.find(id);

    if (!existing.isActive || !from.includes(existing.status)) {
      throw invalidStatus('This action is not allowed in the item’s current status');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.item.updateMany({
        where: { id, isActive: true, status: { in: [...from] } },
        data: { ...data, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidStatus('This item was changed by someone else. Reload and try again.');
      }

      const item = await tx.item.findUniqueOrThrow({ where: { id }, include: itemInclude });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Item',
        entityId: id,
        before: toItemAuditSnapshot(existing),
        after: toItemAuditSnapshot(item),
      });

      return item;
    });

    return toItemResponse(updated, itemFlagsFor(access, updated));
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemResponse> {
    assertCanManageItems(access);

    const existing = await this.find(id);

    if (existing.isActive === isActive) {
      return toItemResponse(existing, itemFlagsFor(access, existing));
    }

    if (isActive && !existing.category.isActive) {
      throw parentInactive('category');
    }

    if (isActive && !existing.unit.isActive) {
      throw parentInactive('unit');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: itemInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, item.isActive),
        entityType: 'Item',
        entityId: id,
        before: toItemAuditSnapshot(existing),
        after: toItemAuditSnapshot(item),
      });

      return item;
    });

    return toItemResponse(updated, itemFlagsFor(access, updated));
  }

  private async find(id: string): Promise<ItemWithRelations> {
    const item = await this.prisma.item.findUnique({ where: { id }, include: itemInclude });

    if (item === null) {
      throw notFound(ENTITY);
    }

    return item;
  }

  private assertEditable(item: ItemWithRelations): void {
    if (!item.isActive) {
      throw invalidStatus('Reactivate this item before editing it');
    }

    if (item.status === 'APPROVED') {
      throw invalidStatus('Approved items are locked. Ask the approver to reopen it for editing.');
    }

    if (item.status === 'PENDING_APPROVAL') {
      throw invalidStatus('This item is waiting for approval and cannot be edited');
    }
  }

  private async assertCategoryUsable(categoryId: string): Promise<void> {
    const category = await this.prisma.itemCategory.findUnique({
      where: { id: categoryId },
      select: { isActive: true },
    });

    if (category === null || !category.isActive) {
      throw invalidCategory();
    }
  }

  private async assertUnitUsable(unitId: string): Promise<void> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { isActive: true },
    });

    if (unit === null || !unit.isActive) {
      throw invalidUnit();
    }
  }

  /** Same description + size + unit, ignoring case (spacing is normalised by the contract). */
  private async assertNotDuplicate(
    tx: Tx,
    request: CreateItemRequest,
    exceptId?: string,
  ): Promise<void> {
    const same = await tx.item.findFirst({
      where: {
        unitId: request.unitId,
        description: { equals: request.description, mode: 'insensitive' },
        size: request.size === null ? null : { equals: request.size, mode: 'insensitive' },
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { code: true },
    });

    if (same !== null) {
      throw duplicateItem(same.code);
    }
  }
}
