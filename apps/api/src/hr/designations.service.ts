import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateDesignationRequest,
  DesignationListQuery,
  DesignationResponse,
  PagedDesignationsResponse,
  UpdateDesignationRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { duplicateName, guardUnique } from '../items/item-errors';
import { DESIGNATION_SERIES, nextCode } from '../masters/code-series';
import { hasActiveChildren } from '../masters/hierarchy-errors';
import { notFound, pageOf } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanManageDesignations,
  assertCanViewDesignations,
  canManageDesignations,
} from './designation-access';
import { toDesignationAuditSnapshot, toDesignationResponse } from './designations.mapper';

const ENTITY = 'Designation';

@Injectable()
export class DesignationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: DesignationListQuery,
    access: AccessContext,
  ): Promise<PagedDesignationsResponse> {
    assertCanViewDesignations(access);

    const where: Prisma.DesignationWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    const [total, designations] = await Promise.all([
      this.prisma.designation.count({ where }),
      this.prisma.designation.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const manage = canManageDesignations(access);

    return pageOf(
      designations.map((designation) => toDesignationResponse(designation, manage)),
      total,
      query,
    );
  }

  async get(id: string, access: AccessContext): Promise<DesignationResponse> {
    assertCanViewDesignations(access);

    const designation = await this.prisma.designation.findUnique({ where: { id } });

    if (designation === null) {
      throw notFound(ENTITY);
    }

    return toDesignationResponse(designation, canManageDesignations(access));
  }

  async create(
    request: CreateDesignationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<DesignationResponse> {
    assertCanManageDesignations(access);
    await this.assertNameFree(request.name);

    const created = await guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const code = await nextCode(tx, DESIGNATION_SERIES);
        const designation = await tx.designation.create({
          data: { code, name: request.name, createdById: actorId, updatedById: actorId },
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Designation',
          entityId: designation.id,
          before: null,
          after: toDesignationAuditSnapshot(designation),
        });

        return designation;
      }),
    );

    return toDesignationResponse(created, true);
  }

  async update(
    id: string,
    request: UpdateDesignationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<DesignationResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.name === request.name) {
      return toDesignationResponse(existing, true);
    }

    await this.assertNameFree(request.name, id);

    const updated = await guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const designation = await tx.designation.update({
          where: { id },
          data: { name: request.name, updatedById: actorId },
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'Designation',
          entityId: id,
          before: toDesignationAuditSnapshot(existing),
          after: toDesignationAuditSnapshot(designation),
        });

        return designation;
      }),
    );

    return toDesignationResponse(updated, true);
  }

  async deactivate(
    id: string,
    actorId: string,
    access: AccessContext,
  ): Promise<DesignationResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(
    id: string,
    actorId: string,
    access: AccessContext,
  ): Promise<DesignationResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<DesignationResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toDesignationResponse(existing, true);
    }

    // OQ-144 b: not while active employees use it.
    if (!isActive) {
      const activeEmployees = await this.prisma.employee.count({
        where: { designationId: id, isActive: true },
      });

      if (activeEmployees > 0) {
        throw hasActiveChildren('employees');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const designation = await tx.designation.update({
        where: { id },
        data: { isActive, updatedById: actorId },
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, designation.isActive),
        entityType: 'Designation',
        entityId: id,
        before: toDesignationAuditSnapshot(existing),
        after: toDesignationAuditSnapshot(designation),
      });

      return designation;
    });

    return toDesignationResponse(updated, true);
  }

  private async requireManageable(id: string, access: AccessContext) {
    assertCanManageDesignations(access);

    const designation = await this.prisma.designation.findUnique({ where: { id } });

    if (designation === null) {
      throw notFound(ENTITY);
    }

    return designation;
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const same = await this.prisma.designation.findFirst({
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
