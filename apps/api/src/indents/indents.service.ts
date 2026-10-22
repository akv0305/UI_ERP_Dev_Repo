import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  INDENT_NUMBER_DIGITS,
  INDENT_NUMBER_PREFIX,
  fiscalYearOf,
  formatDocumentNumber,
  type ApproveIndentRequest,
  type CancelIndentRequest,
  type CreateIndentRequest,
  type IndentDetailResponse,
  type IndentFormOptionsResponse,
  type IndentItemOptionsQuery,
  type IndentItemOptionsResponse,
  type IndentListQuery,
  type IndentResponse,
  type IndentStatus,
  type PagedIndentsResponse,
  type RejectIndentRequest,
  type UpdateIndentRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { takeNextNumber } from '../documents/document-number';
import { notFound, pageOf } from '../masters/master-helpers';
import { forbidden, idFilter } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  indentSelfApproval,
  invalidApprovedQuantity,
  invalidDate,
  invalidIndentStatus,
  invalidItems,
  invalidProject,
  invalidQuantity,
  invalidSite,
  invalidStore,
} from './indent-errors';
import {
  EDITABLE_INDENT_STATUSES,
  INDENT_APPROVE,
  INDENT_MANAGE,
  INDENT_VIEW,
  canSeeIndent,
  checkApprovedQuantities,
  fitsUnit,
  indentFlagsFor,
  indentTargetOf,
  todayInIst,
} from './indent-rules';
import {
  indentDetailInclude,
  indentInclude,
  isoDateOf,
  toIndentAuditSnapshot,
  toIndentDetailResponse,
  toIndentResponse,
  type IndentWithDetails,
} from './indents.mapper';

const ENTITY = 'Indent';
const CHANGED_BY_SOMEONE_ELSE = 'This indent was changed by someone else. Reload and try again.';
const NOT_EDITABLE = 'Only a draft or rejected indent can be changed.';
const NOT_PENDING = 'Only a pending indent can be approved or rejected.';
const ITEM_OPTION_LIMIT = 50;

type Tx = Prisma.TransactionClient;

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function headerData(request: UpdateIndentRequest) {
  return {
    siteId: request.siteId,
    storeId: request.storeId,
    indentDate: dateOnly(request.indentDate),
    requiredByDate: request.requiredByDate === null ? null : dateOnly(request.requiredByDate),
    requestedBy: request.requestedBy,
    remarks: request.remarks,
  };
}

function lineData(lines: UpdateIndentRequest['lines']) {
  return lines.map((line, index) => ({
    lineNo: index + 1,
    itemId: line.itemId,
    requiredQty: line.requiredQty,
    purpose: line.purpose,
    remarks: line.remarks,
  }));
}

@Injectable()
export class IndentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: IndentListQuery,
    actorId: string,
    access: AccessContext,
  ): Promise<PagedIndentsResponse> {
    const siteIds = await access.accessibleSiteIds([INDENT_VIEW, INDENT_MANAGE, INDENT_APPROVE]);
    const filters: Prisma.IndentWhereInput[] = [{ siteId: idFilter(siteIds) }];

    if (query.search !== undefined && query.search.length > 0) {
      filters.push({
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { requestedBy: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.projectId !== undefined) {
      filters.push({ projectId: query.projectId });
    }

    if (query.siteId !== undefined) {
      filters.push({ siteId: query.siteId });
    }

    if (query.status !== undefined) {
      filters.push({ status: query.status });
    }

    if (query.fromDate !== undefined) {
      filters.push({ indentDate: { gte: dateOnly(query.fromDate) } });
    }

    if (query.toDate !== undefined) {
      filters.push({ indentDate: { lte: dateOnly(query.toDate) } });
    }

    const where: Prisma.IndentWhereInput = { AND: filters };
    const [total, indents] = await Promise.all([
      this.prisma.indent.count({ where }),
      this.prisma.indent.findMany({
        where,
        include: indentInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      indents.map((indent) => toIndentResponse(indent, indentFlagsFor(access, indent, actorId))),
      total,
      query,
    );
  }

  async get(id: string, actorId: string, access: AccessContext): Promise<IndentDetailResponse> {
    const indent = await this.requireVisible(id, access);

    return toIndentDetailResponse(indent, indentFlagsFor(access, indent, actorId));
  }

  /**
   * Projects, sites and stores the user may raise indents for: active sites where they hold
   * purchase.indents.manage (from any assignment level), with their active projects and stores.
   */
  async formOptions(access: AccessContext): Promise<IndentFormOptionsResponse> {
    const siteIds = await access.accessibleSiteIds(INDENT_MANAGE);
    const sites = await this.prisma.site.findMany({
      where: {
        id: idFilter(siteIds),
        isActive: true,
        project: { isActive: true, company: { isActive: true } },
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        projectId: true,
        project: { select: { code: true, name: true, companyId: true } },
        stores: {
          where: { isActive: true },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          select: { id: true, code: true, name: true },
        },
      },
    });
    const projects = new Map<string, { id: string; label: string; companyId: string }>();

    for (const site of sites) {
      projects.set(site.projectId, {
        id: site.projectId,
        label: codeLabel(site.project.code, site.project.name),
        companyId: site.project.companyId,
      });
    }

    return {
      projects: [...projects.values()].sort((a, b) => a.label.localeCompare(b.label)),
      sites: sites.map((site) => ({
        id: site.id,
        label: codeLabel(site.code, site.name),
        projectId: site.projectId,
      })),
      stores: sites.flatMap((site) =>
        site.stores.map((store) => ({
          id: store.id,
          label: codeLabel(store.code, store.name),
          siteId: site.id,
        })),
      ),
    };
  }

  /** Approved, active items for the line picker (OQ-38), searched by code, description or size. */
  async itemOptions(query: IndentItemOptionsQuery): Promise<IndentItemOptionsResponse> {
    const where: Prisma.ItemWhereInput = { status: 'APPROVED', isActive: true };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { size: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.item.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: ITEM_OPTION_LIMIT,
      select: {
        id: true,
        code: true,
        description: true,
        size: true,
        unit: { select: { code: true, decimalPlaces: true } },
      },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        label: codeLabel(
          item.code,
          item.size === null ? item.description : `${item.description}, ${item.size}`,
        ),
        unitCode: item.unit.code,
        decimalPlaces: item.unit.decimalPlaces,
      })),
    };
  }

  async create(
    request: CreateIndentRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<IndentResponse> {
    // Scope is checked before the site is looked up, so existence is not revealed.
    if (!(await access.can(INDENT_MANAGE, { siteId: request.siteId }))) {
      throw forbidden();
    }

    this.assertDates(request);

    const header = await this.checkHeader(request.projectId, request.siteId, request.storeId);

    await this.checkLines(request.lines);

    const created = await this.prisma.$transaction(async (tx) => {
      const indent = await tx.indent.create({
        data: {
          companyId: header.companyId,
          projectId: request.projectId,
          ...headerData(request),
          createdById: actorId,
          updatedById: actorId,
          lines: { create: lineData(request.lines) },
        },
        include: indentDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'CREATE',
        entityType: 'Indent',
        entityId: indent.id,
        companyId: indent.companyId,
        before: null,
        after: toIndentAuditSnapshot(indent),
      });

      return indent;
    });

    return toIndentResponse(created, indentFlagsFor(access, created, actorId));
  }

  /** Draft or Rejected only. The project is fixed; the whole line list is replaced (OQ-43 b). */
  async update(
    id: string,
    request: UpdateIndentRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<IndentResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertEditable(existing);

    if (
      request.siteId !== existing.siteId &&
      !(await access.can(INDENT_MANAGE, { siteId: request.siteId }))
    ) {
      throw forbidden();
    }

    this.assertDates(request);
    await this.checkHeader(existing.projectId, request.siteId, request.storeId);
    await this.checkLines(request.lines);

    return this.transition(
      existing,
      EDITABLE_INDENT_STATUSES,
      actorId,
      access,
      () => Promise.resolve(headerData(request)),
      async (tx) => {
        await tx.indentLine.deleteMany({ where: { indentId: id } });
        await tx.indentLine.createMany({
          data: lineData(request.lines).map((line) => ({ ...line, indentId: id })),
        });
      },
    );
  }

  /** Takes the number on first submit (PD-003, OQ-41); a resubmitted indent keeps its number. */
  async submit(id: string, actorId: string, access: AccessContext): Promise<IndentResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertEditable(existing);
    await this.checkHeader(existing.projectId, existing.siteId, existing.storeId);
    await this.checkLines(
      existing.lines.map((line) => ({
        itemId: line.item.id,
        requiredQty: line.requiredQty.toFixed(3),
      })),
    );

    return this.transition(existing, EDITABLE_INDENT_STATUSES, actorId, access, async (tx) => {
      let number = existing.number;
      let fiscalYear = existing.fiscalYear;

      if (number === null) {
        fiscalYear = fiscalYearOf(isoDateOf(existing.indentDate));

        const next = await takeNextNumber(tx, {
          companyId: existing.companyId,
          documentType: 'INDENT',
          projectId: existing.projectId,
          fiscalYear,
        });

        number = formatDocumentNumber(
          INDENT_NUMBER_PREFIX,
          existing.project.code,
          fiscalYear,
          next,
          INDENT_NUMBER_DIGITS,
        );
      }

      return {
        status: 'PENDING_APPROVAL',
        number,
        fiscalYear,
        submittedAt: new Date(),
        submittedById: actorId,
        decidedAt: null,
        decidedById: null,
        decisionRemarks: null,
      };
    });
  }

  async approve(
    id: string,
    request: ApproveIndentRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<IndentResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanDecide(existing, actorId, access);

    const problem = checkApprovedQuantities(
      existing.lines.map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        requiredQty: line.requiredQty.toFixed(3),
        decimalPlaces: line.item.unit.decimalPlaces,
      })),
      request.lines,
    );

    if (problem !== null) {
      throw invalidApprovedQuantity(problem);
    }

    return this.transition(
      existing,
      ['PENDING_APPROVAL'],
      actorId,
      access,
      () =>
        Promise.resolve({
          status: 'APPROVED' as const,
          decidedAt: new Date(),
          decidedById: actorId,
          decisionRemarks: request.remarks,
        }),
      async (tx) => {
        for (const line of request.lines) {
          await tx.indentLine.update({
            where: { id: line.lineId },
            data: { approvedQty: line.approvedQty },
          });
        }
      },
    );
  }

  async reject(
    id: string,
    request: RejectIndentRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<IndentResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanDecide(existing, actorId, access);

    return this.transition(existing, ['PENDING_APPROVAL'], actorId, access, () =>
      Promise.resolve({
        status: 'REJECTED' as const,
        decidedAt: new Date(),
        decidedById: actorId,
        decisionRemarks: request.remarks,
      }),
    );
  }

  async cancel(
    id: string,
    request: CancelIndentRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<IndentResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertEditable(existing);

    return this.transition(existing, EDITABLE_INDENT_STATUSES, actorId, access, () =>
      Promise.resolve({
        status: 'CANCELLED' as const,
        cancelledAt: new Date(),
        cancelledById: actorId,
        cancelRemarks: request.remarks,
      }),
    );
  }

  /**
   * One status/field change in one transaction: the row is updated only if its status is allowed
   * and nobody saved it since it was read (updatedAt), then the audit row is written.
   */
  private async transition(
    existing: IndentWithDetails,
    allowed: readonly IndentStatus[],
    actorId: string,
    access: AccessContext,
    data: (tx: Tx) => Promise<Prisma.IndentUncheckedUpdateManyInput>,
    after?: (tx: Tx) => Promise<void>,
  ): Promise<IndentResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const values = await data(tx);
      const result = await tx.indent.updateMany({
        where: { id: existing.id, status: { in: [...allowed] }, updatedAt: existing.updatedAt },
        data: { ...values, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidIndentStatus(CHANGED_BY_SOMEONE_ELSE);
      }

      if (after !== undefined) {
        await after(tx);
      }

      const indent = await tx.indent.findUniqueOrThrow({
        where: { id: existing.id },
        include: indentDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Indent',
        entityId: indent.id,
        companyId: indent.companyId,
        before: toIndentAuditSnapshot(existing),
        after: toIndentAuditSnapshot(indent),
      });

      return indent;
    });

    return toIndentResponse(updated, indentFlagsFor(access, updated, actorId));
  }

  /** Out-of-scope indents do not exist as far as the caller can tell: 404, never 403. */
  private async requireVisible(id: string, access: AccessContext): Promise<IndentWithDetails> {
    const indent = await this.prisma.indent.findUnique({
      where: { id },
      include: indentDetailInclude,
    });

    if (indent === null || !canSeeIndent(access, indentTargetOf(indent))) {
      throw notFound(ENTITY);
    }

    return indent;
  }

  private assertCanManage(indent: IndentWithDetails, access: AccessContext): void {
    if (!access.canOn(INDENT_MANAGE, indentTargetOf(indent))) {
      throw forbidden();
    }
  }

  private assertEditable(indent: IndentWithDetails): void {
    if (!EDITABLE_INDENT_STATUSES.includes(indent.status)) {
      throw invalidIndentStatus(NOT_EDITABLE);
    }
  }

  /** Approver over the site, indent pending, and not its creator or submitter. */
  private assertCanDecide(indent: IndentWithDetails, actorId: string, access: AccessContext): void {
    if (!access.canOn(INDENT_APPROVE, indentTargetOf(indent))) {
      throw forbidden();
    }

    if (indent.status !== 'PENDING_APPROVAL') {
      throw invalidIndentStatus(NOT_PENDING);
    }

    if (indent.createdById === actorId || indent.submittedById === actorId) {
      throw indentSelfApproval();
    }
  }

  /** OQ-43 a: the indent date is not in the future (IST). */
  private assertDates(request: UpdateIndentRequest): void {
    if (request.indentDate > todayInIst()) {
      throw invalidDate('The indent date cannot be in the future.');
    }
  }

  /** Site belongs to the project and is active; project and company active; store of the site. */
  private async checkHeader(
    projectId: string,
    siteId: string,
    storeId: string | null,
  ): Promise<{ companyId: string }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        isActive: true,
        projectId: true,
        project: {
          select: { isActive: true, companyId: true, company: { select: { isActive: true } } },
        },
      },
    });

    if (site === null || site.projectId !== projectId || !site.isActive) {
      throw invalidSite();
    }

    if (!site.project.isActive || !site.project.company.isActive) {
      throw invalidProject();
    }

    if (storeId !== null) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { siteId: true, isActive: true },
      });

      if (store === null || store.siteId !== siteId || !store.isActive) {
        throw invalidStore();
      }
    }

    return { companyId: site.project.companyId };
  }

  /** Items approved and active (OQ-27, OQ-38); quantities within the unit's decimal places. */
  private async checkLines(
    lines: readonly { itemId: string; requiredQty: string }[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.itemId))];
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        code: true,
        status: true,
        isActive: true,
        unit: { select: { decimalPlaces: true } },
      },
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const unusable = ids.filter((id) => {
      const item = byId.get(id);

      return item === undefined || item.status !== 'APPROVED' || !item.isActive;
    });

    if (unusable.length > 0) {
      throw invalidItems(unusable.map((id) => byId.get(id)?.code ?? id));
    }

    lines.forEach((line, index) => {
      const places = byId.get(line.itemId)?.unit.decimalPlaces ?? 0;

      if (!fitsUnit(line.requiredQty, places)) {
        throw invalidQuantity(index + 1, places);
      }
    });
  }
}
