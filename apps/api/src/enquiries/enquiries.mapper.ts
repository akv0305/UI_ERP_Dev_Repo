import type { Prisma } from '@prisma/client';
import type { EnquiryDetailResponse, EnquiryLineResponse, EnquiryResponse } from '@uie/contracts';
import { isoDateOf } from '../indents/indents.mapper';
import type { EnquiryFlags } from './enquiry-rules';

const actorSelect = { select: { id: true, displayName: true } } as const;
const scopeSelect = { select: { id: true, code: true, name: true } } as const;

export const enquiryInclude = {
  company: { select: { id: true, code: true, legalName: true } },
  project: scopeSelect,
  site: scopeSelect,
  sentBy: actorSelect,
  closedBy: actorSelect,
  cancelledBy: actorSelect,
  createdBy: actorSelect,
  _count: { select: { lines: true, vendors: true } },
} satisfies Prisma.EnquiryInclude;

export const enquiryDetailInclude = {
  ...enquiryInclude,
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
      indentLine: {
        select: {
          id: true,
          indentId: true,
          lineNo: true,
          approvedQty: true,
          indent: { select: { number: true } },
        },
      },
      item: {
        select: {
          id: true,
          code: true,
          description: true,
          size: true,
          unit: { select: { code: true, decimalPlaces: true } },
        },
      },
    },
  },
  vendors: {
    orderBy: { vendor: { code: 'asc' } },
    include: { vendor: { select: { id: true, code: true, legalName: true } } },
  },
} satisfies Prisma.EnquiryInclude;

export type EnquiryWithRelations = Prisma.EnquiryGetPayload<{ include: typeof enquiryInclude }>;
export type EnquiryWithDetails = Prisma.EnquiryGetPayload<{
  include: typeof enquiryDetailInclude;
}>;

type EnquiryLineRow = EnquiryWithDetails['lines'][number];

export function toEnquiryResponse(
  enquiry: EnquiryWithRelations,
  flags: EnquiryFlags,
): EnquiryResponse {
  return {
    id: enquiry.id,
    number: enquiry.number,
    fiscalYear: enquiry.fiscalYear,
    status: enquiry.status,
    company: {
      id: enquiry.company.id,
      code: enquiry.company.code,
      name: enquiry.company.legalName,
    },
    project: enquiry.project,
    site: enquiry.site,
    enquiryDate: isoDateOf(enquiry.enquiryDate),
    quoteDueDate: isoDateOf(enquiry.quoteDueDate),
    terms: enquiry.terms,
    remarks: enquiry.remarks,
    lineCount: enquiry._count.lines,
    vendorCount: enquiry._count.vendors,
    sentAt: enquiry.sentAt?.toISOString() ?? null,
    sentBy: enquiry.sentBy,
    closedAt: enquiry.closedAt?.toISOString() ?? null,
    closedBy: enquiry.closedBy,
    cancelledAt: enquiry.cancelledAt?.toISOString() ?? null,
    cancelledBy: enquiry.cancelledBy,
    cancelRemarks: enquiry.cancelRemarks,
    createdBy: enquiry.createdBy,
    createdAt: enquiry.createdAt.toISOString(),
    updatedAt: enquiry.updatedAt.toISOString(),
    ...flags,
  };
}

/** Quantities are shown with the unit's decimal places (validated on save). */
export function toEnquiryLineResponse(row: EnquiryLineRow): EnquiryLineResponse {
  const places = row.item.unit.decimalPlaces;

  return {
    id: row.id,
    lineNo: row.lineNo,
    indentLine: {
      id: row.indentLine.id,
      indentId: row.indentLine.indentId,
      // An approved indent always has a number; '' only guards the type.
      indentNumber: row.indentLine.indent.number ?? '',
      lineNo: row.indentLine.lineNo,
      approvedQty: row.indentLine.approvedQty?.toFixed(places) ?? (0).toFixed(places),
    },
    item: {
      id: row.item.id,
      code: row.item.code,
      description: row.item.description,
      size: row.item.size,
      unitCode: row.item.unit.code,
      decimalPlaces: places,
    },
    quantity: row.quantity.toFixed(places),
    remarks: row.remarks,
  };
}

export function toEnquiryDetailResponse(
  enquiry: EnquiryWithDetails,
  flags: EnquiryFlags,
): EnquiryDetailResponse {
  return {
    ...toEnquiryResponse(enquiry, flags),
    lines: enquiry.lines.map(toEnquiryLineResponse),
    vendors: enquiry.vendors.map((row) => row.vendor),
  };
}

/** Readable values for the Audit Log: codes and numbers instead of ids. */
export function toEnquiryAuditSnapshot(enquiry: EnquiryWithDetails): Record<string, unknown> {
  return {
    number: enquiry.number,
    fiscalYear: enquiry.fiscalYear,
    status: enquiry.status,
    project: enquiry.project.code,
    site: enquiry.site.code,
    enquiryDate: isoDateOf(enquiry.enquiryDate),
    quoteDueDate: isoDateOf(enquiry.quoteDueDate),
    terms: enquiry.terms,
    remarks: enquiry.remarks,
    cancelRemarks: enquiry.cancelRemarks,
    lines: enquiry.lines.map((line) => ({
      lineNo: line.lineNo,
      indent: line.indentLine.indent.number,
      indentLineNo: line.indentLine.lineNo,
      item: line.item.code,
      quantity: line.quantity.toFixed(3),
      remarks: line.remarks,
    })),
    vendors: enquiry.vendors.map((row) => row.vendor.code),
  };
}
