import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ENQUIRY_NUMBER_DIGITS,
  ENQUIRY_NUMBER_PREFIX,
  fiscalYearOf,
  formatDocumentNumber,
  type CancelEnquiryRequest,
  type CreateEnquiryRequest,
  type EnquiryDetailResponse,
  type EnquiryFormOptionsResponse,
  type EnquiryIndentLineOptionsQuery,
  type EnquiryIndentLineOptionsResponse,
  type EnquiryListQuery,
  type EnquiryPrintResponse,
  type EnquiryResponse,
  type EnquiryStatus,
  type EnquiryVendorOptionsQuery,
  type EnquiryVendorOptionsResponse,
  type PagedEnquiriesResponse,
  type UpdateEnquiryRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { takeNextNumber } from '../documents/document-number';
import { invalidProject, invalidSite } from '../indents/indent-errors';
import { todayInIst } from '../indents/indent-rules';
import { isoDateOf } from '../indents/indents.mapper';
import { notFound, pageOf } from '../masters/master-helpers';
import { forbidden, idFilter } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  enquiryLineError,
  invalidEnquiryDate,
  invalidEnquiryStatus,
  invalidVendors,
} from './enquiry-errors';
import {
  CANCELLABLE_ENQUIRY_STATUSES,
  EDITABLE_ENQUIRY_STATUSES,
  ENQUIRY_MANAGE,
  ENQUIRY_VIEW,
  PRINTABLE_ENQUIRY_STATUSES,
  canSeeEnquiry,
  enquiryFlagsFor,
  enquiryLineProblem,
  enquiryTargetOf,
  type IndentLineForEnquiry,
} from './enquiry-rules';
import {
  enquiryDetailInclude,
  enquiryInclude,
  printAddressSelect,
  toEnquiryAuditSnapshot,
  toEnquiryDetailResponse,
  toEnquiryLineResponse,
  toEnquiryResponse,
  toPrintAddress,
  type EnquiryWithDetails,
} from './enquiries.mapper';

const ENTITY = 'Enquiry';
const CHANGED_BY_SOMEONE_ELSE = 'This enquiry was changed by someone else. Reload and try again.';
const NOT_EDITABLE = 'Only a draft enquiry can be changed or sent.';
const NOT_SENT = 'Only a sent enquiry can be closed.';
const NOT_CANCELLABLE = 'Only a draft or sent enquiry can be cancelled.';
const NOT_PRINTABLE = 'Vendor copies can be printed after the enquiry is sent.';
const VENDOR_OPTION_LIMIT = 50;
const INDENT_LINE_OPTION_LIMIT = 200;

type Tx = Prisma.TransactionClient;

type LineInput = { indentLineId: string; quantity: string; remarks: string | null };

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function headerData(request: UpdateEnquiryRequest) {
  return {
    siteId: request.siteId,
    enquiryDate: dateOnly(request.enquiryDate),
    quoteDueDate: dateOnly(request.quoteDueDate),
    terms: request.terms,
    remarks: request.remarks,
  };
}

/** itemId is copied from the indent line (checkLines returns the map). */
function lineData(lines: readonly LineInput[], itemIds: ReadonlyMap<string, string>) {
  return lines.map((line, index) => {
    const itemId = itemIds.get(line.indentLineId);

    if (itemId === undefined) {
      throw new Error('Enquiry line was not checked before saving');
    }

    return {
      lineNo: index + 1,
      indentLineId: line.indentLineId,
      itemId,
      quantity: line.quantity,
      remarks: line.remarks,
    };
  });
}

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: EnquiryListQuery, access: AccessContext): Promise<PagedEnquiriesResponse> {
    const siteIds = await access.accessibleSiteIds([ENQUIRY_VIEW, ENQUIRY_MANAGE]);
    const filters: Prisma.EnquiryWhereInput[] = [{ siteId: idFilter(siteIds) }];

    if (query.search !== undefined && query.search.length > 0) {
      filters.push({
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          {
            vendors: {
              some: { vendor: { legalName: { contains: query.search, mode: 'insensitive' } } },
            },
          },
        ],
      });
    }

    if (query.projectId !== undefined) {
      filters.push({ projectId: query.projectId });
    }

    if (query.siteId !== undefined) {
      filters.push({ siteId: query.siteId });
    }

    if (query.vendorId !== undefined) {
      filters.push({ vendors: { some: { vendorId: query.vendorId } } });
    }

    if (query.status !== undefined) {
      filters.push({ status: query.status });
    }

    if (query.fromDate !== undefined) {
      filters.push({ enquiryDate: { gte: dateOnly(query.fromDate) } });
    }

    if (query.toDate !== undefined) {
      filters.push({ enquiryDate: { lte: dateOnly(query.toDate) } });
    }

    const where: Prisma.EnquiryWhereInput = { AND: filters };
    const [total, enquiries] = await Promise.all([
      this.prisma.enquiry.count({ where }),
      this.prisma.enquiry.findMany({
        where,
        include: enquiryInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      enquiries.map((enquiry) => toEnquiryResponse(enquiry, enquiryFlagsFor(access, enquiry))),
      total,
      query,
    );
  }

  async get(id: string, access: AccessContext): Promise<EnquiryDetailResponse> {
    const enquiry = await this.requireVisible(id, access);

    return toEnquiryDetailResponse(enquiry, enquiryFlagsFor(access, enquiry));
  }

  /** Active sites where the user holds purchase.enquiries.manage, with their active projects. */
  async formOptions(access: AccessContext): Promise<EnquiryFormOptionsResponse> {
    const siteIds = await access.accessibleSiteIds(ENQUIRY_MANAGE);
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
    };
  }

  /**
   * Lines of Approved indents of the site with approved qty > 0 and a usable item (OQ-27).
   * enquiryCount = enquiries (not cancelled) the line is already on (OQ-46).
   */
  async indentLineOptions(
    query: EnquiryIndentLineOptionsQuery,
    access: AccessContext,
  ): Promise<EnquiryIndentLineOptionsResponse> {
    if (!(await access.can(ENQUIRY_MANAGE, { siteId: query.siteId }))) {
      throw forbidden();
    }

    const where: Prisma.IndentLineWhereInput = {
      indent: { siteId: query.siteId, status: 'APPROVED' },
      approvedQty: { gt: 0 },
      item: { status: 'APPROVED', isActive: true },
    };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { item: { code: { contains: query.search, mode: 'insensitive' } } },
        { item: { description: { contains: query.search, mode: 'insensitive' } } },
        { indent: { number: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.indentLine.findMany({
      where,
      orderBy: [{ indent: { indentDate: 'asc' } }, { indentId: 'asc' }, { lineNo: 'asc' }],
      take: INDENT_LINE_OPTION_LIMIT,
      select: {
        id: true,
        indentId: true,
        lineNo: true,
        approvedQty: true,
        indent: { select: { number: true, indentDate: true } },
        item: {
          select: {
            id: true,
            code: true,
            description: true,
            size: true,
            unit: { select: { code: true, decimalPlaces: true } },
          },
        },
        _count: {
          select: {
            enquiryLines: { where: { enquiry: { status: { not: 'CANCELLED' } } } },
          },
        },
      },
    });

    return {
      lines: rows.map((row) => {
        const places = row.item.unit.decimalPlaces;

        return {
          indentLineId: row.id,
          indentId: row.indentId,
          indentNumber: row.indent.number ?? '',
          indentDate: isoDateOf(row.indent.indentDate),
          lineNo: row.lineNo,
          item: {
            id: row.item.id,
            code: row.item.code,
            description: row.item.description,
            size: row.item.size,
            unitCode: row.item.unit.code,
            decimalPlaces: places,
          },
          approvedQty: row.approvedQty?.toFixed(places) ?? (0).toFixed(places),
          enquiryCount: row._count.enquiryLines,
        };
      }),
    };
  }

  /** Approved, active vendors searched by code, legal or trade name. */
  async vendorOptions(query: EnquiryVendorOptionsQuery): Promise<EnquiryVendorOptionsResponse> {
    const where: Prisma.VendorWhereInput = { status: 'APPROVED', isActive: true };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { legalName: { contains: query.search, mode: 'insensitive' } },
        { tradeName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const vendors = await this.prisma.vendor.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: VENDOR_OPTION_LIMIT,
      select: { id: true, code: true, legalName: true },
    });

    return {
      vendors: vendors.map((vendor) => ({
        id: vendor.id,
        label: codeLabel(vendor.code, vendor.legalName),
      })),
    };
  }

  async create(
    request: CreateEnquiryRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EnquiryResponse> {
    // Scope is checked before the site is looked up, so existence is not revealed.
    if (!(await access.can(ENQUIRY_MANAGE, { siteId: request.siteId }))) {
      throw forbidden();
    }

    this.assertDates(request);

    const header = await this.checkHeader(request.projectId, request.siteId);
    const itemIds = await this.checkLines(request.siteId, request.lines);

    await this.checkVendors(request.vendorIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const enquiry = await tx.enquiry.create({
        data: {
          companyId: header.companyId,
          projectId: request.projectId,
          ...headerData(request),
          createdById: actorId,
          updatedById: actorId,
          lines: { create: lineData(request.lines, itemIds) },
          vendors: { create: request.vendorIds.map((vendorId) => ({ vendorId })) },
        },
        include: enquiryDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'CREATE',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        companyId: enquiry.companyId,
        before: null,
        after: toEnquiryAuditSnapshot(enquiry),
      });

      return enquiry;
    });

    return toEnquiryResponse(created, enquiryFlagsFor(access, created));
  }

  /** Draft only. Project fixed; the whole line and vendor lists are replaced. */
  async update(
    id: string,
    request: UpdateEnquiryRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EnquiryResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, EDITABLE_ENQUIRY_STATUSES, NOT_EDITABLE);

    if (
      request.siteId !== existing.siteId &&
      !(await access.can(ENQUIRY_MANAGE, { siteId: request.siteId }))
    ) {
      throw forbidden();
    }

    this.assertDates(request);
    await this.checkHeader(existing.projectId, request.siteId);

    const itemIds = await this.checkLines(request.siteId, request.lines);

    await this.checkVendors(request.vendorIds);

    return this.transition(
      existing,
      EDITABLE_ENQUIRY_STATUSES,
      actorId,
      access,
      () => Promise.resolve(headerData(request)),
      async (tx) => {
        await tx.enquiryLine.deleteMany({ where: { enquiryId: id } });
        await tx.enquiryLine.createMany({
          data: lineData(request.lines, itemIds).map((line) => ({ ...line, enquiryId: id })),
        });
        await tx.enquiryVendor.deleteMany({ where: { enquiryId: id } });
        await tx.enquiryVendor.createMany({
          data: request.vendorIds.map((vendorId) => ({ enquiryId: id, vendorId })),
        });
      },
    );
  }

  /** Re-checks everything, then takes the number in the same transaction (PD-003, no gaps). */
  async send(id: string, actorId: string, access: AccessContext): Promise<EnquiryResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, EDITABLE_ENQUIRY_STATUSES, NOT_EDITABLE);
    await this.checkHeader(existing.projectId, existing.siteId);
    await this.checkLines(
      existing.siteId,
      existing.lines.map((line) => ({
        indentLineId: line.indentLine.id,
        quantity: line.quantity.toFixed(3),
        remarks: line.remarks,
      })),
    );
    await this.checkVendors(existing.vendors.map((row) => row.vendor.id));

    return this.transition(existing, EDITABLE_ENQUIRY_STATUSES, actorId, access, async (tx) => {
      const fiscalYear = fiscalYearOf(isoDateOf(existing.enquiryDate));
      const next = await takeNextNumber(tx, {
        companyId: existing.companyId,
        documentType: 'ENQUIRY',
        projectId: existing.projectId,
        fiscalYear,
      });

      return {
        status: 'SENT',
        number: formatDocumentNumber(
          ENQUIRY_NUMBER_PREFIX,
          existing.project.code,
          fiscalYear,
          next,
          ENQUIRY_NUMBER_DIGITS,
        ),
        fiscalYear,
        sentAt: new Date(),
        sentById: actorId,
      };
    });
  }

  async close(id: string, actorId: string, access: AccessContext): Promise<EnquiryResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, ['SENT'], NOT_SENT);

    return this.transition(existing, ['SENT'], actorId, access, () =>
      Promise.resolve({
        status: 'CLOSED' as const,
        closedAt: new Date(),
        closedById: actorId,
      }),
    );
  }

  async cancel(
    id: string,
    request: CancelEnquiryRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EnquiryResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, CANCELLABLE_ENQUIRY_STATUSES, NOT_CANCELLABLE);

    return this.transition(existing, CANCELLABLE_ENQUIRY_STATUSES, actorId, access, () =>
      Promise.resolve({
        status: 'CANCELLED' as const,
        cancelledAt: new Date(),
        cancelledById: actorId,
        cancelRemarks: request.remarks,
      }),
    );
  }

  /** One vendor's copy of a sent or closed enquiry (OQ-52 A); the vendor must be on the enquiry. */
  async print(id: string, vendorId: string, access: AccessContext): Promise<EnquiryPrintResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertStatus(existing, PRINTABLE_ENQUIRY_STATUSES, NOT_PRINTABLE);

    if (!existing.vendors.some((row) => row.vendor.id === vendorId)) {
      throw notFound('Vendor');
    }

    const [company, project, site, vendor] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: existing.companyId },
        select: { code: true, legalName: true, pan: true, ...printAddressSelect },
      }),
      this.prisma.project.findUniqueOrThrow({
        where: { id: existing.projectId },
        select: { billingGst: { select: { gstin: true } } },
      }),
      this.prisma.site.findUniqueOrThrow({
        where: { id: existing.siteId },
        select: {
          code: true,
          name: true,
          stateId: true,
          contactPerson: true,
          contactPhone: true,
          ...printAddressSelect,
        },
      }),
      this.prisma.vendor.findUniqueOrThrow({
        where: { id: vendorId },
        select: {
          id: true,
          code: true,
          legalName: true,
          ...printAddressSelect,
          gstRegistrations: {
            where: { isActive: true },
            orderBy: { gstin: 'asc' },
            select: { gstin: true, stateId: true },
          },
          contacts: {
            where: { isActive: true },
            orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
            take: 1,
            select: { name: true, phone: true, email: true },
          },
        },
      }),
    ]);

    const vendorGst =
      vendor.gstRegistrations.find((row) => row.stateId === site.stateId) ??
      vendor.gstRegistrations[0];
    const contact = vendor.contacts[0];

    return {
      id: existing.id,
      // A sent or closed enquiry always has a number; '' only guards the type.
      number: existing.number ?? '',
      status: existing.status,
      enquiryDate: isoDateOf(existing.enquiryDate),
      quoteDueDate: isoDateOf(existing.quoteDueDate),
      terms: existing.terms,
      company: {
        code: company.code,
        legalName: company.legalName,
        pan: company.pan,
        gstin: project.billingGst?.gstin ?? null,
        address: toPrintAddress(company),
      },
      project: existing.project,
      site: {
        code: site.code,
        name: site.name,
        address: toPrintAddress(site),
        contactPerson: site.contactPerson,
        contactPhone: site.contactPhone,
      },
      vendor: {
        id: vendor.id,
        code: vendor.code,
        legalName: vendor.legalName,
        gstin: vendorGst?.gstin ?? null,
        address: toPrintAddress(vendor),
        contactName: contact?.name ?? null,
        contactPhone: contact?.phone ?? null,
        contactEmail: contact?.email ?? null,
      },
      lines: existing.lines.map((row) => {
        const line = toEnquiryLineResponse(row);

        return {
          lineNo: line.lineNo,
          item: line.item,
          quantity: line.quantity,
          remarks: line.remarks,
        };
      }),
    };
  }

  /**
   * One change in one transaction: the row is updated only if its status is allowed and nobody
   * saved it since it was read (updatedAt), then the audit row is written.
   */
  private async transition(
    existing: EnquiryWithDetails,
    allowed: readonly EnquiryStatus[],
    actorId: string,
    access: AccessContext,
    data: (tx: Tx) => Promise<Prisma.EnquiryUncheckedUpdateManyInput>,
    after?: (tx: Tx) => Promise<void>,
  ): Promise<EnquiryResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const values = await data(tx);
      const result = await tx.enquiry.updateMany({
        where: { id: existing.id, status: { in: [...allowed] }, updatedAt: existing.updatedAt },
        data: { ...values, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidEnquiryStatus(CHANGED_BY_SOMEONE_ELSE);
      }

      if (after !== undefined) {
        await after(tx);
      }

      const enquiry = await tx.enquiry.findUniqueOrThrow({
        where: { id: existing.id },
        include: enquiryDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        companyId: enquiry.companyId,
        before: toEnquiryAuditSnapshot(existing),
        after: toEnquiryAuditSnapshot(enquiry),
      });

      return enquiry;
    });

    return toEnquiryResponse(updated, enquiryFlagsFor(access, updated));
  }

  /** Out-of-scope enquiries do not exist as far as the caller can tell: 404, never 403. */
  private async requireVisible(id: string, access: AccessContext): Promise<EnquiryWithDetails> {
    const enquiry = await this.prisma.enquiry.findUnique({
      where: { id },
      include: enquiryDetailInclude,
    });

    if (enquiry === null || !canSeeEnquiry(access, enquiryTargetOf(enquiry))) {
      throw notFound(ENTITY);
    }

    return enquiry;
  }

  private assertCanManage(enquiry: EnquiryWithDetails, access: AccessContext): void {
    if (!access.canOn(ENQUIRY_MANAGE, enquiryTargetOf(enquiry))) {
      throw forbidden();
    }
  }

  private assertStatus(
    enquiry: EnquiryWithDetails,
    allowed: readonly EnquiryStatus[],
    message: string,
  ): void {
    if (!allowed.includes(enquiry.status)) {
      throw invalidEnquiryStatus(message);
    }
  }

  /** The enquiry date is not in the future (IST), same rule as the indent (OQ-43 a). */
  private assertDates(request: { enquiryDate: string }): void {
    if (request.enquiryDate > todayInIst()) {
      throw invalidEnquiryDate('The enquiry date cannot be in the future.');
    }
  }

  /** Site belongs to the project and is active; project and company active. */
  private async checkHeader(projectId: string, siteId: string): Promise<{ companyId: string }> {
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

    return { companyId: site.project.companyId };
  }

  /** Every line passes enquiryLineProblem; returns indentLineId -> itemId for saving. */
  private async checkLines(
    siteId: string,
    lines: readonly LineInput[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(lines.map((line) => line.indentLineId))];
    const rows = await this.prisma.indentLine.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        itemId: true,
        approvedQty: true,
        indent: { select: { siteId: true, status: true } },
        item: {
          select: {
            code: true,
            status: true,
            isActive: true,
            unit: { select: { decimalPlaces: true } },
          },
        },
      },
    });
    const byId = new Map<string, IndentLineForEnquiry>(
      rows.map((row) => [
        row.id,
        {
          siteId: row.indent.siteId,
          indentApproved: row.indent.status === 'APPROVED',
          approvedQty: row.approvedQty === null ? null : row.approvedQty.toFixed(3),
          itemCode: row.item.code,
          itemUsable: row.item.status === 'APPROVED' && row.item.isActive,
          decimalPlaces: row.item.unit.decimalPlaces,
        },
      ]),
    );

    lines.forEach((line, index) => {
      const problem = enquiryLineProblem(
        index + 1,
        line.quantity,
        siteId,
        byId.get(line.indentLineId),
      );

      if (problem !== null) {
        throw enquiryLineError(problem);
      }
    });

    return new Map(rows.map((row) => [row.id, row.itemId]));
  }

  /** Approved, active vendors only. */
  private async checkVendors(vendorIds: readonly string[]): Promise<void> {
    const ids = [...new Set(vendorIds)];
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, status: true, isActive: true },
    });
    const byId = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const unusable = ids.filter((id) => {
      const vendor = byId.get(id);

      return vendor === undefined || vendor.status !== 'APPROVED' || !vendor.isActive;
    });

    if (unusable.length > 0) {
      throw invalidVendors(unusable.map((id) => byId.get(id)?.code ?? id));
    }
  }
}
