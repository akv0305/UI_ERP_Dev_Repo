import type { Prisma } from '@prisma/client';
import {
  quotationNumberLabel,
  type QuotationChargeResponse,
  type QuotationDetailResponse,
  type QuotationLineResponse,
  type QuotationResponse,
} from '@uie/contracts';
import { isoDateOf } from '../indents/indents.mapper';
import type { QuotationFlags } from './quotation-rules';

const actorSelect = { select: { id: true, displayName: true } } as const;
const scopeSelect = { select: { id: true, code: true, name: true } } as const;

export const quotationInclude = {
  company: { select: { id: true, code: true, legalName: true } },
  project: scopeSelect,
  site: scopeSelect,
  enquiry: { select: { id: true, number: true, status: true } },
  vendor: { select: { id: true, code: true, legalName: true } },
  submittedBy: actorSelect,
  cancelledBy: actorSelect,
  createdBy: actorSelect,
  lines: { select: { isQuoted: true } },
} satisfies Prisma.QuotationInclude;

export const quotationDetailInclude = {
  ...quotationInclude,
  lines: {
    orderBy: { lineNo: 'asc' },
    include: {
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
  charges: { orderBy: { chargeType: 'asc' } },
} satisfies Prisma.QuotationInclude;

export type QuotationWithRelations = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;
export type QuotationWithDetails = Prisma.QuotationGetPayload<{
  include: typeof quotationDetailInclude;
}>;

type QuotationLineRow = QuotationWithDetails['lines'][number];
type QuotationChargeRow = QuotationWithDetails['charges'][number];

function fixed(value: Prisma.Decimal | null, places: number): string | null {
  return value === null ? null : value.toFixed(places);
}

export function toQuotationResponse(
  quotation: QuotationWithRelations,
  flags: QuotationFlags,
): QuotationResponse {
  return {
    id: quotation.id,
    number: quotation.number,
    revisionNo: quotation.revisionNo,
    revisedFromId: quotation.revisedFromId,
    fiscalYear: quotation.fiscalYear,
    status: quotation.status,
    company: {
      id: quotation.company.id,
      code: quotation.company.code,
      name: quotation.company.legalName,
    },
    project: quotation.project,
    site: quotation.site,
    // A quotation exists only for a sent enquiry, which always has a number; '' only guards the type.
    enquiry: { id: quotation.enquiry.id, number: quotation.enquiry.number ?? '' },
    vendor: quotation.vendor,
    vendorQuoteRef: quotation.vendorQuoteRef,
    quoteDate: isoDateOf(quotation.quoteDate),
    validUntil: quotation.validUntil === null ? null : isoDateOf(quotation.validUntil),
    deliveryDays: quotation.deliveryDays,
    paymentTermsDays: quotation.paymentTermsDays,
    remarks: quotation.remarks,
    subtotal: quotation.subtotal.toFixed(2),
    taxTotal: quotation.taxTotal.toFixed(2),
    chargesTotal: quotation.chargesTotal.toFixed(2),
    grandTotal: quotation.grandTotal.toFixed(2),
    lineCount: quotation.lines.length,
    quotedLineCount: quotation.lines.filter((line) => line.isQuoted).length,
    submittedAt: quotation.submittedAt?.toISOString() ?? null,
    submittedBy: quotation.submittedBy,
    supersededAt: quotation.supersededAt?.toISOString() ?? null,
    cancelledAt: quotation.cancelledAt?.toISOString() ?? null,
    cancelledBy: quotation.cancelledBy,
    cancelRemarks: quotation.cancelRemarks,
    createdBy: quotation.createdBy,
    createdAt: quotation.createdAt.toISOString(),
    updatedAt: quotation.updatedAt.toISOString(),
    ...flags,
  };
}

export function toQuotationLineResponse(row: QuotationLineRow): QuotationLineResponse {
  const places = row.item.unit.decimalPlaces;

  return {
    id: row.id,
    lineNo: row.lineNo,
    enquiryLineId: row.enquiryLineId,
    item: {
      id: row.item.id,
      code: row.item.code,
      description: row.item.description,
      size: row.item.size,
      unitCode: row.item.unit.code,
      decimalPlaces: places,
    },
    quantity: row.quantity.toFixed(places),
    isQuoted: row.isQuoted,
    rate: fixed(row.rate, 4),
    discountPercent: fixed(row.discountPercent, 2),
    gstRate: fixed(row.gstRate, 2),
    taxableAmount: fixed(row.taxableAmount, 2),
    taxAmount: fixed(row.taxAmount, 2),
    lineTotal: fixed(row.lineTotal, 2),
    makeBrand: row.makeBrand,
    remarks: row.remarks,
  };
}

export function toQuotationChargeResponse(row: QuotationChargeRow): QuotationChargeResponse {
  return {
    id: row.id,
    chargeType: row.chargeType,
    description: row.description,
    amount: row.amount.toFixed(2),
    gstRate: row.gstRate.toFixed(2),
    taxAmount: row.taxAmount.toFixed(2),
  };
}

export function toQuotationDetailResponse(
  quotation: QuotationWithDetails,
  flags: QuotationFlags,
): QuotationDetailResponse {
  return {
    ...toQuotationResponse(quotation, flags),
    lines: quotation.lines.map(toQuotationLineResponse),
    charges: quotation.charges.map(toQuotationChargeResponse),
  };
}

/** Readable values for the Audit Log: codes and numbers instead of ids. */
export function toQuotationAuditSnapshot(quotation: QuotationWithDetails): Record<string, unknown> {
  return {
    number:
      quotation.number === null
        ? null
        : quotationNumberLabel(quotation.number, quotation.revisionNo),
    revisionNo: quotation.revisionNo,
    fiscalYear: quotation.fiscalYear,
    status: quotation.status,
    enquiry: quotation.enquiry.number,
    vendor: quotation.vendor.code,
    project: quotation.project.code,
    site: quotation.site.code,
    vendorQuoteRef: quotation.vendorQuoteRef,
    quoteDate: isoDateOf(quotation.quoteDate),
    validUntil: quotation.validUntil === null ? null : isoDateOf(quotation.validUntil),
    deliveryDays: quotation.deliveryDays,
    paymentTermsDays: quotation.paymentTermsDays,
    remarks: quotation.remarks,
    subtotal: quotation.subtotal.toFixed(2),
    taxTotal: quotation.taxTotal.toFixed(2),
    chargesTotal: quotation.chargesTotal.toFixed(2),
    grandTotal: quotation.grandTotal.toFixed(2),
    cancelRemarks: quotation.cancelRemarks,
    lines: quotation.lines.map((line) => ({
      lineNo: line.lineNo,
      item: line.item.code,
      quantity: line.quantity.toFixed(3),
      isQuoted: line.isQuoted,
      rate: fixed(line.rate, 4),
      discountPercent: fixed(line.discountPercent, 2),
      gstRate: fixed(line.gstRate, 2),
      lineTotal: fixed(line.lineTotal, 2),
      makeBrand: line.makeBrand,
      remarks: line.remarks,
    })),
    charges: quotation.charges.map((charge) => ({
      chargeType: charge.chargeType,
      description: charge.description,
      amount: charge.amount.toFixed(2),
      gstRate: charge.gstRate.toFixed(2),
      taxAmount: charge.taxAmount.toFixed(2),
    })),
  };
}
