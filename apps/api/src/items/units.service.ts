import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateUnitRequest,
  ItemUnitOptionsResponse,
  PagedUnitsResponse,
  UnitListQuery,
  UnitResponse,
  UpdateUnitRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { hasActiveChildren } from '../masters/hierarchy-errors';
import { assertCodeUnchanged, duplicateCode, notFound, pageOf } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanManageItems, assertCanViewItems, canManageItems } from './item-access';
import { duplicateName, guardUnique } from './item-errors';
import { toUnitAuditSnapshot, toUnitResponse } from './units.mapper';

const ENTITY = 'Unit';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UnitListQuery, access: AccessContext): Promise<PagedUnitsResponse> {
    assertCanViewItems(access);

    const where: Prisma.UnitWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    const [total, units] = await Promise.all([
      this.prisma.unit.count({ where }),
      this.prisma.unit.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const manage = canManageItems(access);

    return pageOf(
      units.map((unit) => toUnitResponse(unit, manage)),
      total,
      query,
    );
  }

  /** Active units for the item form pick list. */
  async options(access: AccessContext): Promise<ItemUnitOptionsResponse> {
    assertCanManageItems(access);

    const units = await this.prisma.unit.findMany({
      where: { isActive: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, decimalPlaces: true },
    });

    return {
      items: units.map((unit) => ({
        id: unit.id,
        label: codeLabel(unit.code, unit.name),
        decimalPlaces: unit.decimalPlaces,
      })),
    };
  }

  async get(id: string, access: AccessContext): Promise<UnitResponse> {
    assertCanViewItems(access);

    const unit = await this.prisma.unit.findUnique({ where: { id } });

    if (unit === null) {
      throw notFound(ENTITY);
    }

    return toUnitResponse(unit, canManageItems(access));
  }

  async create(
    request: CreateUnitRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<UnitResponse> {
    assertCanManageItems(access);
    await this.assertCodeFree(request.code);
    await this.assertNameFree(request.name);

    const created = await guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: {
            code: request.code,
            name: request.name,
            decimalPlaces: request.decimalPlaces,
            createdById: actorId,
            updatedById: actorId,
          },
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Unit',
          entityId: unit.id,
          before: null,
          after: toUnitAuditSnapshot(unit),
        });

        return unit;
      }),
    );

    return toUnitResponse(created, true);
  }

  async update(
    id: string,
    request: UpdateUnitRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<UnitResponse> {
    const existing = await this.requireManageable(id, access);

    assertCodeUnchanged(request.code, existing.code);

    if (existing.name === request.name && existing.decimalPlaces === request.decimalPlaces) {
      return toUnitResponse(existing, true);
    }

    await this.assertNameFree(request.name, id);

    const updated = await guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.update({
          where: { id },
          data: {
            name: request.name,
            decimalPlaces: request.decimalPlaces,
            updatedById: actorId,
          },
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'Unit',
          entityId: id,
          before: toUnitAuditSnapshot(existing),
          after: toUnitAuditSnapshot(unit),
        });

        return unit;
      }),
    );

    return toUnitResponse(updated, true);
  }

  async deactivate(id: string, actorId: string, access: AccessContext): Promise<UnitResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(id: string, actorId: string, access: AccessContext): Promise<UnitResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<UnitResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toUnitResponse(existing, true);
    }

    if (!isActive) {
      const activeItems = await this.prisma.item.count({ where: { unitId: id, isActive: true } });

      if (activeItems > 0) {
        throw hasActiveChildren('items');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.update({
        where: { id },
        data: { isActive, updatedById: actorId },
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, unit.isActive),
        entityType: 'Unit',
        entityId: id,
        before: toUnitAuditSnapshot(existing),
        after: toUnitAuditSnapshot(unit),
      });

      return unit;
    });

    return toUnitResponse(updated, true);
  }

  private async requireManageable(id: string, access: AccessContext) {
    assertCanManageItems(access);

    const unit = await this.prisma.unit.findUnique({ where: { id } });

    if (unit === null) {
      throw notFound(ENTITY);
    }

    return unit;
  }

  private async assertCodeFree(code: string): Promise<void> {
    const same = await this.prisma.unit.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateCode();
    }
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const same = await this.prisma.unit.findFirst({
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
