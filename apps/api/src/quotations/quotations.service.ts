import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  QUOTATION_NUMBER_DIGITS,
  QUOTATION_NUMBER_PREFIX,
  fiscalYearOf,
  formatDocumentNumber,
  type CancelQuotationRequest,
  type CreateQuotationRequest,
  type PagedQuotationsResponse,
  type QuotationDetailResponse,
  type QuotationEnquiryFormResponse,
  type QuotationEnquiryOptionsQuery,
  type QuotationEnquiryOptionsResponse,
  type QuotationListQuery,
  type QuotationResponse,
  type QuotationStatus,
  type UpdateQuotationRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { takeNextNumber } from '../documents/document-number';
import { indentTargetOf, todayInIst } from '../indents/indent-rules';
import { isoDateOf } from '../indents/indents.mapper';
import { isUniqueViolation, notFound, pageOf, toDateOnly } from '../masters/master-helpers';
import { forbidden, idFilter } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  duplicateQuotation,
  invalidQuotationDate,
  invalidQuotationEnquiry,
  invalidQuotationLines,
  invalidQuotationStatus,
  invalidQuotationVendor,
} from './quotation-errors';
import {
  priceQuotation,
  type PricedQuotation,
  type PricingChargeInput,
  type PricingLineInput,
} from './quotation-math';
import {
  CANCELLABLE_QUOTATION_STATUSES,
  EDITABLE_QUOTATION_STATUSES,
  OPEN_QUOTATION_STATUSES,
  QUOTATION_MANAGE,
  QUOTATION_VIEW,
  canSeeQuotation,
  quotationFlagsFor,
  quotationTargetOf,
} from './quotation-rules';
import {
  quotationDetailInclude,
  quotationInclude,
  toQuotationAuditSnapshot,
  toQuotationDetailResponse,
  toQuotationResponse,
  type QuotationWithDetails,
  type QuotationWithRelations,
} from './quotations.mapper';

const ENTITY = 'Quotation';
const CHANGED_BY_SOMEONE_ELSE = 'This quotation was changed by someone else. Reload and try again.';
const NOT_EDITABLE = 'Only a draft quotation can be changed or submitted.';
const NOT_SUBMITTED = 'Only a submitted quotation can be revised.';
const NOT_CANCELLABLE = 'Only a draft or submitted quotation can be cancelled.';
const ENQUIRY_NOT_SENT = 'Quotations can be entered only while the enquiry is sent.';
const OPEN_QUOTATION_EXISTS =
  'This vendor already has a draft or submitted quotation for this enquiry. Open it, or revise the submitted one.';
const DRAFT_REVISION_EXISTS = 'A draft revision of this quotation already exists. Open it instead.';
const ENQUIRY_OPTION_LIMIT = 50;

type Tx = Prisma.TransactionClient;

/** What the quotation rules need from the enquiry. */
const enquirySelect = {
  id: true,
  number: true,
  status: true,
  enquiryDate: true,
  companyId: true,
  projectId: true,
  siteId: true,
  vendors: {
    select: { vendor: { select: { id: true, code: true, status: true, isActive: true } } },
  },
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      id: true,
      lineNo: true,
      itemId: true,
      quantity: true,
      item: { select: { code: true, status: true, isActive: true } },
    },
  },
} satisfies Prisma.EnquirySelect;

type EnquiryForQuotation = Prisma.EnquiryGetPayload<{ select: typeof enquirySelect }>;

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function pairKey(row: { enquiryId: string; vendorId: string }): string {
  return `${row.enquiryId}:${row.vendorId}`;
}

function headerData(request: UpdateQuotationRequest, priced: PricedQuotation) {
  return {
    vendorQuoteRef: request.vendorQuoteRef,
    quoteDate: dateOnly(request.quoteDate),
    validUntil: toDateOnly(request.validUntil),
    deliveryDays: request.deliveryDays,
    paymentTermsDays: request.paymentTermsDays,
    remarks: request.remarks,
    subtotal: priced.subtotal,
    taxTotal: priced.taxTotal,
    chargesTotal: priced.chargesTotal,
    grandTotal: priced.grandTotal,
  };
}

/** Saved rows turned back into pricing input, so Submit re-checks exactly what was saved. */
function storedLinesOf(quotation: QuotationWithDetails): PricingLineInput[] {
  return quotation.lines.map((line) => ({
    enquiryLineId: line.enquiryLineId,
    isQuoted: line.isQuoted,
    rate: line.rate?.toFixed(4) ?? null,
    discountPercent: line.discountPercent?.toFixed(2) ?? null,
    gstRate: line.gstRate?.toFixed(2) ?? null,
    makeBrand: line.makeBrand,
    remarks: line.remarks,
  }));
}

function storedChargesOf(quotation: QuotationWithDetails): PricingChargeInput[] {
  return quotation.charges.map((charge) => ({
    chargeType: charge.chargeType,
    description: charge.description,
    amount: charge.amount.toFixed(2),
    gstRate: charge.gstRate.toFixed(2),
  }));
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QuotationListQuery, access: AccessContext): Promise<PagedQuotationsResponse> {
    const siteIds = await access.accessibleSiteIds([QUOTATION_VIEW, QUOTATION_MANAGE]);
    const filters: Prisma.QuotationWhereInput[] = [{ siteId: idFilter(siteIds) }];

    if (query.search !== undefined && query.search.length > 0) {
      filters.push({
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { vendorQuoteRef: { contains: query.search, mode: 'insensitive' } },
          { vendor: { code: { contains: query.search, mode: 'insensitive' } } },
          { vendor: { legalName: { contains: query.search, mode: 'insensitive' } } },
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

    if (query.vendorId !== undefined) {
      filters.push({ vendorId: query.vendorId });
    }

    if (query.status !== undefined) {
      filters.push({ status: query.status });
    }

    const where: Prisma.QuotationWhereInput = { AND: filters };
    const [total, quotations] = await Promise.all([
      this.prisma.quotation.count({ where }),
      this.prisma.quotation.findMany({
        where,
        include: quotationInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { revisionNo: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const drafts = await this.openDraftKeys(quotations);

    return pageOf(
      quotations.map((quotation) =>
        toQuotationResponse(
          quotation,
          quotationFlagsFor(access, quotation, drafts.has(pairKey(quotation))),
        ),
      ),
      total,
      query,
    );
  }

  async get(id: string, access: AccessContext): Promise<QuotationDetailResponse> {
    const quotation = await this.requireVisible(id, access);
    const drafts = await this.openDraftKeys([quotation]);

    return toQuotationDetailResponse(
      quotation,
      quotationFlagsFor(access, quotation, drafts.has(pairKey(quotation))),
    );
  }

  /** Sent enquiries of sites where the user holds purchase.quotations.manage. */
  async enquiryOptions(
    query: QuotationEnquiryOptionsQuery,
    access: AccessContext,
  ): Promise<QuotationEnquiryOptionsResponse> {
    const siteIds = await access.accessibleSiteIds(QUOTATION_MANAGE);
    const where: Prisma.EnquiryWhereInput = { siteId: idFilter(siteIds), status: 'SENT' };

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

  /** Everything the quotation form needs for one sent enquiry. */
  async enquiryForm(
    enquiryId: string,
    access: AccessContext,
  ): Promise<QuotationEnquiryFormResponse> {
    const enquiry = await this.prisma.enquiry.findUnique({
      where: { id: enquiryId },
      select: {
        id: true,
        number: true,
        status: true,
        quoteDueDate: true,
        companyId: true,
        projectId: true,
        siteId: true,
        project: { select: { id: true, code: true, name: true } },
        site: { select: { id: true, code: true, name: true } },
        vendors: {
          orderBy: { vendor: { code: 'asc' } },
          select: { vendor: { select: { id: true, code: true, legalName: true } } },
        },
        lines: {
          orderBy: { lineNo: 'asc' },
          select: {
            id: true,
            lineNo: true,
            quantity: true,
            item: {
              select: {
                id: true,
                code: true,
                description: true,
                size: true,
                gstRate: true,
                unit: { select: { code: true, decimalPlaces: true } },
              },
            },
          },
        },
      },
    });

    if (enquiry === null || !access.canOn(QUOTATION_MANAGE, indentTargetOf(enquiry))) {
      throw notFound('Enquiry');
    }

    if (enquiry.status !== 'SENT') {
      throw invalidQuotationEnquiry(ENQUIRY_NOT_SENT);
    }

    const open = await this.prisma.quotation.findMany({
      where: { enquiryId, status: { in: [...OPEN_QUOTATION_STATUSES] } },
      select: { vendorId: true },
    });
    const quotedVendorIds = new Set(open.map((row) => row.vendorId));

    return {
      enquiry: {
        id: enquiry.id,
        number: enquiry.number ?? '',
        quoteDueDate: isoDateOf(enquiry.quoteDueDate),
        project: enquiry.project,
        site: enquiry.site,
      },
      vendors: enquiry.vendors.map((row) => ({
        id: row.vendor.id,
        label: codeLabel(row.vendor.code, row.vendor.legalName),
        hasQuotation: quotedVendorIds.has(row.vendor.id),
      })),
      lines: enquiry.lines.map((line) => {
        const places = line.item.unit.decimalPlaces;

        return {
          enquiryLineId: line.id,
          lineNo: line.lineNo,
          item: {
            id: line.item.id,
            code: line.item.code,
            description: line.item.description,
            size: line.item.size,
            unitCode: line.item.unit.code,
            decimalPlaces: places,
          },
          quantity: line.quantity.toFixed(places),
          defaultGstRate: line.item.gstRate?.toFixed(2) ?? null,
        };
      }),
    };
  }

  async create(
    request: CreateQuotationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<QuotationResponse> {
    const enquiry = await this.loadEnquiry(request.enquiryId);

    // Scope is checked before anything about the enquiry is revealed.
    if (enquiry === null || !access.canOn(QUOTATION_MANAGE, indentTargetOf(enquiry))) {
      throw notFound('Enquiry');
    }

    this.assertEnquirySent(enquiry);
    this.assertVendor(enquiry, request.vendorId);
    this.assertDates(request.quoteDate, enquiry);

    const priced = this.price(enquiry, request.lines, request.charges);
    const open = await this.prisma.quotation.count({
      where: {
        enquiryId: request.enquiryId,
        vendorId: request.vendorId,
        status: { in: [...OPEN_QUOTATION_STATUSES] },
      },
    });

    if (open > 0) {
      throw duplicateQuotation(OPEN_QUOTATION_EXISTS);
    }

    const created = await this.guardDuplicate(OPEN_QUOTATION_EXISTS, () =>
      this.prisma.$transaction(async (tx) => {
        const quotation = await tx.quotation.create({
          data: {
            companyId: enquiry.companyId,
            projectId: enquiry.projectId,
            siteId: enquiry.siteId,
            enquiryId: enquiry.id,
            vendorId: request.vendorId,
            ...headerData(request, priced),
            createdById: actorId,
            updatedById: actorId,
            lines: { create: priced.lines },
            charges: { create: priced.charges },
          },
          include: quotationDetailInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Quotation',
          entityId: quotation.id,
          companyId: quotation.companyId,
          before: null,
          after: toQuotationAuditSnapshot(quotation),
        });

        return quotation;
      }),
    );

    return this.respond(created, access);
  }

  /** Draft only. Enquiry and vendor fixed; lines and charges replaced. */
  async update(
    id: string,
    request: UpdateQuotationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<QuotationResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, EDITABLE_QUOTATION_STATUSES, NOT_EDITABLE);

    const enquiry = await this.requireEnquiry(existing.enquiryId);

    this.assertEnquirySent(enquiry);
    this.assertVendor(enquiry, existing.vendorId);
    this.assertDates(request.quoteDate, enquiry);

    const priced = this.price(enquiry, request.lines, request.charges);

    return this.transition(
      existing,
      EDITABLE_QUOTATION_STATUSES,
      actorId,
      access,
      () => Promise.resolve(headerData(request, priced)),
      async (tx) => {
        await tx.quotationLine.deleteMany({ where: { quotationId: id } });
        await tx.quotationLine.createMany({
          data: priced.lines.map((line) => ({ ...line, quotationId: id })),
        });
        await tx.quotationCharge.deleteMany({ where: { quotationId: id } });
        await tx.quotationCharge.createMany({
          data: priced.charges.map((charge) => ({ ...charge, quotationId: id })),
        });
      },
    );
  }

  /**
   * Re-checks the saved quotation. First submit takes the number (PD-003, no gaps); a revision keeps it
   * and supersedes the vendor's previous submitted quotation in the same transaction (OQ-54).
   */
  async submit(id: string, actorId: string, access: AccessContext): Promise<QuotationResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, EDITABLE_QUOTATION_STATUSES, NOT_EDITABLE);

    const enquiry = await this.requireEnquiry(existing.enquiryId);

    this.assertEnquirySent(enquiry);
    this.assertVendor(enquiry, existing.vendorId);
    this.price(enquiry, storedLinesOf(existing), storedChargesOf(existing));

    return this.guardDuplicate(OPEN_QUOTATION_EXISTS, () =>
      this.transition(existing, EDITABLE_QUOTATION_STATUSES, actorId, access, async (tx) => {
        const now = new Date();

        if (existing.revisionNo > 0) {
          await this.supersede(tx, existing, actorId, now);

          return { status: 'SUBMITTED', submittedAt: now, submittedById: actorId };
        }

        const fiscalYear = fiscalYearOf(isoDateOf(existing.quoteDate));
        const next = await takeNextNumber(tx, {
          companyId: existing.companyId,
          documentType: 'QUOTATION',
          projectId: existing.projectId,
          fiscalYear,
        });

        return {
          status: 'SUBMITTED',
          number: formatDocumentNumber(
            QUOTATION_NUMBER_PREFIX,
            existing.project.code,
            fiscalYear,
            next,
            QUOTATION_NUMBER_DIGITS,
          ),
          fiscalYear,
          submittedAt: now,
          submittedById: actorId,
        };
      }),
    );
  }

  /** New Draft copy of a submitted quotation: same number, next revision (OQ-54). */
  async revise(id: string, actorId: string, access: AccessContext): Promise<QuotationResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, ['SUBMITTED'], NOT_SUBMITTED);

    const enquiry = await this.requireEnquiry(existing.enquiryId);

    this.assertEnquirySent(enquiry);
    this.assertVendor(enquiry, existing.vendorId);

    const number = existing.number;

    if (number === null) {
      throw new Error('Submitted quotation without a number');
    }

    const drafts = await this.openDraftKeys([existing]);

    if (drafts.has(pairKey(existing))) {
      throw duplicateQuotation(DRAFT_REVISION_EXISTS);
    }

    const created = await this.guardDuplicate(DRAFT_REVISION_EXISTS, () =>
      this.prisma.$transaction(async (tx) => {
        const latest = await tx.quotation.aggregate({
          where: { number },
          _max: { revisionNo: true },
        });
        const revisionNo = (latest._max.revisionNo ?? existing.revisionNo) + 1;
        const quotation = await tx.quotation.create({
          data: {
            number,
            revisionNo,
            revisedFromId: existing.id,
            fiscalYear: existing.fiscalYear,
            companyId: existing.companyId,
            projectId: existing.projectId,
            siteId: existing.siteId,
            enquiryId: existing.enquiryId,
            vendorId: existing.vendorId,
            vendorQuoteRef: existing.vendorQuoteRef,
            quoteDate: existing.quoteDate,
            validUntil: existing.validUntil,
            deliveryDays: existing.deliveryDays,
            paymentTermsDays: existing.paymentTermsDays,
            remarks: existing.remarks,
            subtotal: existing.subtotal,
            taxTotal: existing.taxTotal,
            chargesTotal: existing.chargesTotal,
            grandTotal: existing.grandTotal,
            createdById: actorId,
            updatedById: actorId,
            lines: {
              create: existing.lines.map((line) => ({
                lineNo: line.lineNo,
                enquiryLineId: line.enquiryLineId,
                itemId: line.itemId,
                quantity: line.quantity,
                isQuoted: line.isQuoted,
                rate: line.rate,
                discountPercent: line.discountPercent,
                gstRate: line.gstRate,
                taxableAmount: line.taxableAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                makeBrand: line.makeBrand,
                remarks: line.remarks,
              })),
            },
            charges: {
              create: existing.charges.map((charge) => ({
                chargeType: charge.chargeType,
                description: charge.description,
                amount: charge.amount,
                gstRate: charge.gstRate,
                taxAmount: charge.taxAmount,
              })),
            },
          },
          include: quotationDetailInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Quotation',
          entityId: quotation.id,
          companyId: quotation.companyId,
          before: null,
          after: toQuotationAuditSnapshot(quotation),
        });

        return quotation;
      }),
    );

    return this.respond(created, access);
  }

  async cancel(
    id: string,
    request: CancelQuotationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<QuotationResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, CANCELLABLE_QUOTATION_STATUSES, NOT_CANCELLABLE);
    const usedInComparison = await this.prisma.comparisonQuotation.count({
      where: { quotationId: id, comparison: { status: 'FINALISED' } },
    });

    if (usedInComparison > 0) {
      throw invalidQuotationStatus(
        'This quotation is part of a finalised comparison and cannot be cancelled.',
      );
    }

    return this.transition(existing, CANCELLABLE_QUOTATION_STATUSES, actorId, access, () =>
      Promise.resolve({
        status: 'CANCELLED' as const,
        cancelledAt: new Date(),
        cancelledById: actorId,
        cancelRemarks: request.remarks,
      }),
    );
  }

  /** The vendor's current submitted quotation for this enquiry becomes Superseded (audited). */
  private async supersede(
    tx: Tx,
    draft: QuotationWithDetails,
    actorId: string,
    now: Date,
  ): Promise<void> {
    const previous = await tx.quotation.findMany({
      where: { enquiryId: draft.enquiryId, vendorId: draft.vendorId, status: 'SUBMITTED' },
      include: quotationDetailInclude,
    });

    for (const row of previous) {
      const superseded = await tx.quotation.update({
        where: { id: row.id },
        data: { status: 'SUPERSEDED', supersededAt: now, updatedById: actorId },
        include: quotationDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Quotation',
        entityId: row.id,
        companyId: row.companyId,
        before: toQuotationAuditSnapshot(row),
        after: toQuotationAuditSnapshot(superseded),
      });
    }
  }

  /**
   * One change in one transaction: updated only if the status is allowed and nobody saved it since it
   * was read (updatedAt), then the audit row is written.
   */
  private async transition(
    existing: QuotationWithDetails,
    allowed: readonly QuotationStatus[],
    actorId: string,
    access: AccessContext,
    data: (tx: Tx) => Promise<Prisma.QuotationUncheckedUpdateManyInput>,
    after?: (tx: Tx) => Promise<void>,
  ): Promise<QuotationResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const values = await data(tx);
      const result = await tx.quotation.updateMany({
        where: { id: existing.id, status: { in: [...allowed] }, updatedAt: existing.updatedAt },
        data: { ...values, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidQuotationStatus(CHANGED_BY_SOMEONE_ELSE);
      }

      if (after !== undefined) {
        await after(tx);
      }

      const quotation = await tx.quotation.findUniqueOrThrow({
        where: { id: existing.id },
        include: quotationDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Quotation',
        entityId: quotation.id,
        companyId: quotation.companyId,
        before: toQuotationAuditSnapshot(existing),
        after: toQuotationAuditSnapshot(quotation),
      });

      return quotation;
    });

    return this.respond(updated, access);
  }

  private async respond(
    quotation: QuotationWithRelations,
    access: AccessContext,
  ): Promise<QuotationResponse> {
    const drafts = await this.openDraftKeys([quotation]);

    return toQuotationResponse(
      quotation,
      quotationFlagsFor(access, quotation, drafts.has(pairKey(quotation))),
    );
  }

  /** enquiry:vendor pairs (among submitted rows) that already have a Draft. */
  private async openDraftKeys(
    rows: readonly { status: QuotationStatus; enquiryId: string; vendorId: string }[],
  ): Promise<Set<string>> {
    const submitted = rows.filter((row) => row.status === 'SUBMITTED');

    if (submitted.length === 0) {
      return new Set();
    }

    const drafts = await this.prisma.quotation.findMany({
      where: {
        status: 'DRAFT',
        enquiryId: { in: [...new Set(submitted.map((row) => row.enquiryId))] },
        vendorId: { in: [...new Set(submitted.map((row) => row.vendorId))] },
      },
      select: { enquiryId: true, vendorId: true },
    });

    return new Set(drafts.map(pairKey));
  }

  /** A concurrent save can still hit the partial unique indexes (P2002). */
  private async guardDuplicate<T>(message: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicateQuotation(message);
      }

      throw error;
    }
  }

  /** Out-of-scope quotations do not exist as far as the caller can tell: 404, never 403. */
  private async requireVisible(id: string, access: AccessContext): Promise<QuotationWithDetails> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: quotationDetailInclude,
    });

    if (quotation === null || !canSeeQuotation(access, quotationTargetOf(quotation))) {
      throw notFound(ENTITY);
    }

    return quotation;
  }

  private loadEnquiry(id: string): Promise<EnquiryForQuotation | null> {
    return this.prisma.enquiry.findUnique({ where: { id }, select: enquirySelect });
  }

  private async requireEnquiry(id: string): Promise<EnquiryForQuotation> {
    const enquiry = await this.loadEnquiry(id);

    if (enquiry === null) {
      throw notFound('Enquiry');
    }

    return enquiry;
  }

  private assertCanManage(quotation: QuotationWithDetails, access: AccessContext): void {
    if (!access.canOn(QUOTATION_MANAGE, quotationTargetOf(quotation))) {
      throw forbidden();
    }
  }

  private assertStatus(
    quotation: QuotationWithDetails,
    allowed: readonly QuotationStatus[],
    message: string,
  ): void {
    if (!allowed.includes(quotation.status)) {
      throw invalidQuotationStatus(message);
    }
  }

  /** OQ-58 (b): quotations are keyed only while the enquiry is Sent. */
  private assertEnquirySent(enquiry: EnquiryForQuotation): void {
    if (enquiry.status !== 'SENT') {
      throw invalidQuotationEnquiry(ENQUIRY_NOT_SENT);
    }
  }

  /** The vendor is on the enquiry and still approved and active. */
  private assertVendor(enquiry: EnquiryForQuotation, vendorId: string): void {
    const row = enquiry.vendors.find((entry) => entry.vendor.id === vendorId);

    if (row === undefined) {
      throw invalidQuotationVendor('This vendor is not on the enquiry.');
    }

    if (row.vendor.status !== 'APPROVED' || !row.vendor.isActive) {
      throw invalidQuotationVendor(`Vendor ${row.vendor.code} is no longer approved or active.`);
    }
  }

  /** OQ-58 (a): quote date not in the future (IST) and not before the enquiry date. */
  private assertDates(quoteDate: string, enquiry: EnquiryForQuotation): void {
    if (quoteDate > todayInIst()) {
      throw invalidQuotationDate('The quote date cannot be in the future.');
    }

    if (quoteDate < isoDateOf(enquiry.enquiryDate)) {
      throw invalidQuotationDate('The quote date is before the enquiry date.');
    }
  }

  private price(
    enquiry: EnquiryForQuotation,
    lines: readonly PricingLineInput[],
    charges: readonly PricingChargeInput[],
  ): PricedQuotation {
    const result = priceQuotation(
      enquiry.lines.map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        itemId: line.itemId,
        itemCode: line.item.code,
        quantity: line.quantity.toFixed(3),
        itemUsable: line.item.status === 'APPROVED' && line.item.isActive,
      })),
      lines,
      charges,
    );

    if (result.problem !== null) {
      throw invalidQuotationLines(result.problem);
    }

    return result.priced;
  }
}
