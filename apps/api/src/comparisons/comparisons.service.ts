import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  COMPARISON_NUMBER_DIGITS,
  COMPARISON_NUMBER_PREFIX,
  fiscalYearOf,
  formatDocumentNumber,
  type CancelComparisonRequest,
  type ComparisonDetailResponse,
  type ComparisonEnquiryOptionsQuery,
  type ComparisonEnquiryOptionsResponse,
  type ComparisonGridQuery,
  type ComparisonGridResponse,
  type ComparisonListQuery,
  type ComparisonResponse,
  type ComparisonStatus,
  type CreateComparisonRequest,
  type PagedComparisonsResponse,
  type UpdateComparisonRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { takeNextNumber } from '../documents/document-number';
import { enquiryDetailInclude, toEnquiryAuditSnapshot } from '../enquiries/enquiries.mapper';
import { indentTargetOf, todayInIst } from '../indents/indent-rules';
import { isoDateOf } from '../indents/indents.mapper';
import { isUniqueViolation, notFound, pageOf } from '../masters/master-helpers';
import { forbidden, idFilter } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  comparisonSelectionError,
  duplicateComparison,
  invalidComparisonDate,
  invalidComparisonEnquiry,
  invalidComparisonStatus,
} from './comparison-errors';
import {
  buildGrid,
  selectionProblem,
  type ComparisonGrid,
  type SelectionInput,
} from './comparison-math';
import {
  COMPARISON_MANAGE,
  COMPARISON_VIEW,
  canSeeComparison,
  comparisonFlagsFor,
  comparisonTargetOf,
} from './comparison-rules';
import {
  comparisonInclude,
  gridEnquiryLineSelect,
  gridQuotationSelect,
  toComparisonAuditSnapshot,
  toComparisonDetailResponse,
  toComparisonResponse,
  toGridEnquiryLine,
  toGridQuotation,
  type ComparisonWithRelations,
} from './comparisons.mapper';

const ENTITY = 'Comparison';
const CHANGED_BY_SOMEONE_ELSE =
  'This comparison was changed by someone else. Reload and try again.';
const NOT_DRAFT = 'Only a draft comparison can be changed, finalised or cancelled.';
const ENQUIRY_NOT_SENT = 'A comparison can be made only while the enquiry is sent.';
const NO_QUOTATIONS = 'This enquiry has no submitted quotations yet.';
const OPEN_COMPARISON_EXISTS =
  'This enquiry already has a draft or finalised comparison. Open it instead.';
const ENQUIRY_OPTION_LIMIT = 50;
const DRAFT_STATUSES: readonly ComparisonStatus[] = ['DRAFT'];

type Tx = Prisma.TransactionClient;

const enquirySelect = {
  id: true,
  number: true,
  status: true,
  enquiryDate: true,
  quoteDueDate: true,
  companyId: true,
  projectId: true,
  siteId: true,
  project: { select: { id: true, code: true, name: true } },
  site: { select: { id: true, code: true, name: true } },
} satisfies Prisma.EnquirySelect;

type EnquiryForComparison = Prisma.EnquiryGetPayload<{ select: typeof enquirySelect }>;

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function storedSelection(comparison: ComparisonWithRelations): SelectionInput[] {
  return comparison.lines.map((line) => ({
    enquiryLineId: line.enquiryLineId,
    selectedVendorId: line.selectedVendorId,
    reason: line.reason,
  }));
}

@Injectable()
export class ComparisonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ComparisonListQuery, access: AccessContext): Promise<PagedComparisonsResponse> {
    const siteIds = await access.accessibleSiteIds([COMPARISON_VIEW, COMPARISON_MANAGE]);
    const filters: Prisma.ComparisonWhereInput[] = [{ siteId: idFilter(siteIds) }];

    if (query.search !== undefined && query.search.length > 0) {
      filters.push({
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { enquiry: { number: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.projectId !== undefined) {
      filters.push({ projectId: query.projectId });
    }

    if (query.enquiryId !== undefined) {
      filters.push({ enquiryId: query.enquiryId });
    }

    if (query.status !== undefined) {
      filters.push({ status: query.status });
    }

    const where: Prisma.ComparisonWhereInput = { AND: filters };
    const [total, comparisons] = await Promise.all([
      this.prisma.comparison.count({ where }),
      this.prisma.comparison.findMany({
        where,
        include: comparisonInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      comparisons.map((comparison) =>
        toComparisonResponse(comparison, comparisonFlagsFor(access, comparison)),
      ),
      total,
      query,
    );
  }

  /** Draft / Cancelled: live grid. Finalised: grid of the quotations recorded at Finalise. */
  async get(id: string, access: AccessContext): Promise<ComparisonDetailResponse> {
    const comparison = await this.requireVisible(id, access);
    const grid = await this.gridOf(this.prisma, comparison);

    return toComparisonDetailResponse(comparison, comparisonFlagsFor(access, comparison), grid);
  }

  /** Sent enquiries with a submitted quotation and no open comparison, where the user may manage comparisons. */
  async enquiryOptions(
    query: ComparisonEnquiryOptionsQuery,
    access: AccessContext,
  ): Promise<ComparisonEnquiryOptionsResponse> {
    const siteIds = await access.accessibleSiteIds(COMPARISON_MANAGE);
    const where: Prisma.EnquiryWhereInput = {
      siteId: idFilter(siteIds),
      status: 'SENT',
      quotations: { some: { status: 'SUBMITTED' } },
      comparisons: { none: { status: { not: 'CANCELLED' } } },
    };

    if (query.search !== undefined && query.search.length > 0) {
      where.number = { contains: query.search, mode: 'insensitive' };
    }

    const enquiries = await this.prisma.enquiry.findMany({
      where,
      orderBy: [{ enquiryDate: 'desc' }, { id: 'asc' }],
      take: ENQUIRY_OPTION_LIMIT,
      select: { id: true, number: true, site: { select: { name: true } } },
    });

    return {
      enquiries: enquiries.map((enquiry) => ({
        id: enquiry.id,
        label: codeLabel(enquiry.number ?? '', enquiry.site.name),
      })),
    };
  }

  /** Grid for a new comparison. */
  async grid(query: ComparisonGridQuery, access: AccessContext): Promise<ComparisonGridResponse> {
    const enquiry = await this.requireManagedEnquiry(query.enquiryId, access);

    this.assertEnquirySent(enquiry);

    const grid = await this.loadGrid(
      this.prisma,
      enquiry.id,
      { status: 'SUBMITTED' },
      query.comparisonDate ?? todayInIst(),
    );

    return {
      enquiry: {
        id: enquiry.id,
        number: enquiry.number ?? '',
        enquiryDate: isoDateOf(enquiry.enquiryDate),
        quoteDueDate: isoDateOf(enquiry.quoteDueDate),
        project: enquiry.project,
        site: enquiry.site,
      },
      ...grid,
    };
  }

  async create(
    request: CreateComparisonRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ComparisonResponse> {
    const enquiry = await this.requireManagedEnquiry(request.enquiryId, access);

    this.assertEnquirySent(enquiry);
    this.assertDate(request.comparisonDate, enquiry);

    const open = await this.prisma.comparison.count({
      where: { enquiryId: enquiry.id, status: { not: 'CANCELLED' } },
    });

    if (open > 0) {
      throw duplicateComparison(OPEN_COMPARISON_EXISTS);
    }

    const grid = await this.loadGrid(
      this.prisma,
      enquiry.id,
      { status: 'SUBMITTED' },
      request.comparisonDate,
    );

    this.assertSelection(grid, request.lines, false);

    const created = await this.guardDuplicate(() =>
      this.prisma.$transaction(async (tx) => {
        const comparison = await tx.comparison.create({
          data: {
            companyId: enquiry.companyId,
            projectId: enquiry.projectId,
            siteId: enquiry.siteId,
            enquiryId: enquiry.id,
            comparisonDate: dateOnly(request.comparisonDate),
            remarks: request.remarks,
            createdById: actorId,
            updatedById: actorId,
            lines: {
              create: request.lines.map((line) => ({
                enquiryLineId: line.enquiryLineId,
                selectedVendorId: line.selectedVendorId,
                reason: line.reason,
              })),
            },
          },
          include: comparisonInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Comparison',
          entityId: comparison.id,
          companyId: comparison.companyId,
          before: null,
          after: toComparisonAuditSnapshot(comparison),
        });

        return comparison;
      }),
    );

    return toComparisonResponse(created, comparisonFlagsFor(access, created));
  }

  /** Draft only; the enquiry is fixed; lines replaced. */
  async update(
    id: string,
    request: UpdateComparisonRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ComparisonResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertDraft(existing);

    const enquiry = await this.requireEnquiry(existing.enquiryId);

    this.assertEnquirySent(enquiry);
    this.assertDate(request.comparisonDate, enquiry);

    const grid = await this.loadGrid(
      this.prisma,
      enquiry.id,
      { status: 'SUBMITTED' },
      request.comparisonDate,
    );

    this.assertSelection(grid, request.lines, false);

    return this.transition(
      existing,
      actorId,
      access,
      () =>
        Promise.resolve({
          comparisonDate: dateOnly(request.comparisonDate),
          remarks: request.remarks,
        }),
      async (tx) => {
        await tx.comparisonLine.deleteMany({ where: { comparisonId: id } });
        await tx.comparisonLine.createMany({
          data: request.lines.map((line) => ({
            comparisonId: id,
            enquiryLineId: line.enquiryLineId,
            selectedVendorId: line.selectedVendorId,
            reason: line.reason,
          })),
        });
      },
    );
  }

  /**
   * One transaction: re-check the saved choice against the current grid, take the number (no gaps),
   * record compared quotations and chosen lines, close the enquiry (OQ-65).
   */
  async finalise(id: string, actorId: string, access: AccessContext): Promise<ComparisonResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertDraft(existing);

    const enquiry = await this.requireEnquiry(existing.enquiryId);

    this.assertEnquirySent(enquiry);

    let grid: ComparisonGrid | null = null;

    return this.transition(
      existing,
      actorId,
      access,
      async (tx) => {
        grid = await this.loadGrid(
          tx,
          existing.enquiryId,
          { status: 'SUBMITTED' },
          isoDateOf(existing.comparisonDate),
        );

        if (grid.vendors.length === 0) {
          throw invalidComparisonEnquiry(NO_QUOTATIONS);
        }

        this.assertSelection(grid, storedSelection(existing), true);

        const fiscalYear = fiscalYearOf(isoDateOf(existing.comparisonDate));
        const next = await takeNextNumber(tx, {
          companyId: existing.companyId,
          documentType: 'COMPARISON',
          projectId: existing.projectId,
          fiscalYear,
        });

        return {
          status: 'FINALISED',
          number: formatDocumentNumber(
            COMPARISON_NUMBER_PREFIX,
            existing.project.code,
            fiscalYear,
            next,
            COMPARISON_NUMBER_DIGITS,
          ),
          fiscalYear,
          finalisedAt: new Date(),
          finalisedById: actorId,
        };
      },
      async (tx) => {
        const finalGrid: ComparisonGrid | null = grid;

        if (finalGrid === null) {
          throw new Error('Comparison grid missing at finalise');
        }

        for (const line of existing.lines) {
          if (line.selectedVendorId === null) {
            continue;
          }

          const offer = finalGrid.lines
            .find((row) => row.enquiryLineId === line.enquiryLineId)
            ?.offers.find((row) => row.vendorId === line.selectedVendorId);

          if (offer === undefined || offer.netRate === null || offer.rank === null) {
            throw new Error('Chosen offer missing at finalise');
          }

          await tx.comparisonLine.update({
            where: { id: line.id },
            data: {
              quotationLineId: offer.quotationLineId,
              netRate: offer.netRate,
              rank: offer.rank,
            },
          });
        }

        await tx.comparisonQuotation.createMany({
          data: finalGrid.vendors.map((vendor) => ({
            comparisonId: existing.id,
            quotationId: vendor.quotationId,
          })),
        });

        await this.closeEnquiry(tx, existing.enquiryId, actorId);
      },
    );
  }

  async cancel(
    id: string,
    request: CancelComparisonRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ComparisonResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertDraft(existing);

    return this.transition(existing, actorId, access, () =>
      Promise.resolve({
        status: 'CANCELLED' as const,
        cancelledAt: new Date(),
        cancelledById: actorId,
        cancelRemarks: request.remarks,
      }),
    );
  }

  /** Sent -> Closed with the enquiry's own audit row, inside the finalise transaction. */
  private async closeEnquiry(tx: Tx, enquiryId: string, actorId: string): Promise<void> {
    const before = await tx.enquiry.findUniqueOrThrow({
      where: { id: enquiryId },
      include: enquiryDetailInclude,
    });
    const result = await tx.enquiry.updateMany({
      where: { id: enquiryId, status: 'SENT' },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: actorId, updatedById: actorId },
    });

    if (result.count === 0) {
      throw invalidComparisonEnquiry(ENQUIRY_NOT_SENT);
    }

    const after = await tx.enquiry.findUniqueOrThrow({
      where: { id: enquiryId },
      include: enquiryDetailInclude,
    });

    await this.audit.record(tx, {
      actorUserId: actorId,
      action: 'UPDATE',
      entityType: 'Enquiry',
      entityId: enquiryId,
      companyId: after.companyId,
      before: toEnquiryAuditSnapshot(before),
      after: toEnquiryAuditSnapshot(after),
    });
  }

  /** Updated only if still Draft and unchanged since read (updatedAt); then the audit row. */
  private async transition(
    existing: ComparisonWithRelations,
    actorId: string,
    access: AccessContext,
    data: (tx: Tx) => Promise<Prisma.ComparisonUncheckedUpdateManyInput>,
    after?: (tx: Tx) => Promise<void>,
  ): Promise<ComparisonResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const values = await data(tx);
      const result = await tx.comparison.updateMany({
        where: {
          id: existing.id,
          status: { in: [...DRAFT_STATUSES] },
          updatedAt: existing.updatedAt,
        },
        data: { ...values, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidComparisonStatus(CHANGED_BY_SOMEONE_ELSE);
      }

      if (after !== undefined) {
        await after(tx);
      }

      const comparison = await tx.comparison.findUniqueOrThrow({
        where: { id: existing.id },
        include: comparisonInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Comparison',
        entityId: comparison.id,
        companyId: comparison.companyId,
        before: toComparisonAuditSnapshot(existing),
        after: toComparisonAuditSnapshot(comparison),
      });

      return comparison;
    });

    return toComparisonResponse(updated, comparisonFlagsFor(access, updated));
  }

  private gridOf(db: Tx, comparison: ComparisonWithRelations): Promise<ComparisonGrid> {
    const filter: Prisma.QuotationWhereInput =
      comparison.status === 'FINALISED'
        ? { comparisons: { some: { comparisonId: comparison.id } } }
        : { status: 'SUBMITTED' };

    return this.loadGrid(db, comparison.enquiryId, filter, isoDateOf(comparison.comparisonDate));
  }

  private async loadGrid(
    db: Tx,
    enquiryId: string,
    quotationFilter: Prisma.QuotationWhereInput,
    comparisonDate: string,
  ): Promise<ComparisonGrid> {
    const [lines, quotations] = await Promise.all([
      db.enquiryLine.findMany({
        where: { enquiryId },
        orderBy: { lineNo: 'asc' },
        select: gridEnquiryLineSelect,
      }),
      db.quotation.findMany({
        where: { enquiryId, ...quotationFilter },
        select: gridQuotationSelect,
      }),
    ]);

    return buildGrid(lines.map(toGridEnquiryLine), quotations.map(toGridQuotation), comparisonDate);
  }

  private assertSelection(
    grid: ComparisonGrid,
    lines: readonly SelectionInput[],
    finalising: boolean,
  ): void {
    const problem = selectionProblem(grid, lines, finalising);

    if (problem !== null) {
      throw comparisonSelectionError(problem.code, problem.message);
    }
  }

  /** A concurrent create can still hit the one-open-per-enquiry index (P2002). */
  private async guardDuplicate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicateComparison(OPEN_COMPARISON_EXISTS);
      }

      throw error;
    }
  }

  /** Out-of-scope comparisons do not exist as far as the caller can tell: 404, never 403. */
  private async requireVisible(
    id: string,
    access: AccessContext,
  ): Promise<ComparisonWithRelations> {
    const comparison = await this.prisma.comparison.findUnique({
      where: { id },
      include: comparisonInclude,
    });

    if (comparison === null || !canSeeComparison(access, comparisonTargetOf(comparison))) {
      throw notFound(ENTITY);
    }

    return comparison;
  }

  private async requireEnquiry(id: string): Promise<EnquiryForComparison> {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id }, select: enquirySelect });

    if (enquiry === null) {
      throw notFound('Enquiry');
    }

    return enquiry;
  }

  /** Scope is checked before anything about the enquiry is revealed. */
  private async requireManagedEnquiry(
    id: string,
    access: AccessContext,
  ): Promise<EnquiryForComparison> {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id }, select: enquirySelect });

    if (enquiry === null || !access.canOn(COMPARISON_MANAGE, indentTargetOf(enquiry))) {
      throw notFound('Enquiry');
    }

    return enquiry;
  }

  private assertCanManage(comparison: ComparisonWithRelations, access: AccessContext): void {
    if (!access.canOn(COMPARISON_MANAGE, comparisonTargetOf(comparison))) {
      throw forbidden();
    }
  }

  private assertDraft(comparison: ComparisonWithRelations): void {
    if (!DRAFT_STATUSES.includes(comparison.status)) {
      throw invalidComparisonStatus(NOT_DRAFT);
    }
  }

  private assertEnquirySent(enquiry: { status: string }): void {
    if (enquiry.status !== 'SENT') {
      throw invalidComparisonEnquiry(ENQUIRY_NOT_SENT);
    }
  }

  /** Not in the future (IST) and not before the enquiry date. */
  private assertDate(comparisonDate: string, enquiry: EnquiryForComparison): void {
    if (comparisonDate > todayInIst()) {
      throw invalidComparisonDate('The comparison date cannot be in the future.');
    }

    if (comparisonDate < isoDateOf(enquiry.enquiryDate)) {
      throw invalidComparisonDate('The comparison date is before the enquiry date.');
    }
  }
}
