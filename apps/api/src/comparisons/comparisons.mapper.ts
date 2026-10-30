import type { Prisma } from '@prisma/client';
import {
  quotationNumberLabel,
  type ComparisonDetailResponse,
  type ComparisonResponse,
} from '@uie/contracts';
import { isoDateOf } from '../indents/indents.mapper';
import { formatScaled, toScaled } from '../quotations/quotation-math';
import type { ComparisonGrid, GridEnquiryLine, GridQuotation } from './comparison-math';
import type { ComparisonFlags } from './comparison-rules';

const actorSelect = { select: { id: true, displayName: true } } as const;
const scopeSelect = { select: { id: true, code: true, name: true } } as const;

export const comparisonInclude = {
  company: { select: { id: true, code: true, legalName: true } },
  project: scopeSelect,
  site: scopeSelect,
  enquiry: { select: { id: true, number: true, status: true, enquiryDate: true } },
  finalisedBy: actorSelect,
  cancelledBy: actorSelect,
  createdBy: actorSelect,
  lines: {
    orderBy: { enquiryLine: { lineNo: 'asc' } },
    select: {
      id: true,
      enquiryLineId: true,
      selectedVendorId: true,
      reason: true,
      netRate: true,
      rank: true,
      selectedVendor: { select: { code: true } },
      quotationLine: { select: { taxableAmount: true } },
      enquiryLine: {
        select: {
          lineNo: true,
          item: { select: { code: true } },
          // Draft value: the chosen vendor's current submitted line.
          quotationLines: {
            where: { quotation: { status: 'SUBMITTED' } },
            select: {
              isQuoted: true,
              taxableAmount: true,
              quotation: { select: { vendorId: true } },
            },
          },
        },
      },
    },
  },
  quotations: { select: { quotation: { select: { number: true, revisionNo: true } } } },
} satisfies Prisma.ComparisonInclude;

export type ComparisonWithRelations = Prisma.ComparisonGetPayload<{
  include: typeof comparisonInclude;
}>;

export const gridEnquiryLineSelect = {
  id: true,
  lineNo: true,
  quantity: true,
  item: {
    select: {
      id: true,
      code: true,
      description: true,
      size: true,
      unit: { select: { code: true, decimalPlaces: true } },
    },
  },
} satisfies Prisma.EnquiryLineSelect;

export const gridQuotationSelect = {
  id: true,
  number: true,
  revisionNo: true,
  quoteDate: true,
  validUntil: true,
  deliveryDays: true,
  paymentTermsDays: true,
  subtotal: true,
  taxTotal: true,
  chargesTotal: true,
  grandTotal: true,
  vendor: { select: { id: true, code: true, legalName: true } },
  lines: {
    select: {
      id: true,
      enquiryLineId: true,
      isQuoted: true,
      rate: true,
      discountPercent: true,
      gstRate: true,
      taxableAmount: true,
      lineTotal: true,
      makeBrand: true,
    },
  },
} satisfies Prisma.QuotationSelect;

type GridEnquiryLineRow = Prisma.EnquiryLineGetPayload<{ select: typeof gridEnquiryLineSelect }>;
type GridQuotationRow = Prisma.QuotationGetPayload<{ select: typeof gridQuotationSelect }>;

function fixed(value: Prisma.Decimal | null, places: number): string | null {
  return value === null ? null : value.toFixed(places);
}

export function toGridEnquiryLine(row: GridEnquiryLineRow): GridEnquiryLine {
  const places = row.item.unit.decimalPlaces;

  return {
    enquiryLineId: row.id,
    lineNo: row.lineNo,
    item: {
      id: row.item.id,
      code: row.item.code,
      description: row.item.description,
      size: row.item.size,
      unitCode: row.item.unit.code,
      decimalPlaces: places,
    },
    quantity: row.quantity.toFixed(places),
  };
}

export function toGridQuotation(row: GridQuotationRow): GridQuotation {
  return {
    quotationId: row.id,
    // Only submitted (numbered) quotations are compared; '' only guards the type.
    quotationLabel: quotationNumberLabel(row.number ?? '', row.revisionNo),
    vendor: row.vendor,
    quoteDate: isoDateOf(row.quoteDate),
    validUntil: row.validUntil === null ? null : isoDateOf(row.validUntil),
    deliveryDays: row.deliveryDays,
    paymentTermsDays: row.paymentTermsDays,
    subtotal: row.subtotal.toFixed(2),
    taxTotal: row.taxTotal.toFixed(2),
    chargesTotal: row.chargesTotal.toFixed(2),
    grandTotal: row.grandTotal.toFixed(2),
    lines: row.lines.map((line) => ({
      quotationLineId: line.id,
      enquiryLineId: line.enquiryLineId,
      isQuoted: line.isQuoted,
      rate: fixed(line.rate, 4),
      discountPercent: fixed(line.discountPercent, 2),
      gstRate: fixed(line.gstRate, 2),
      taxableAmount: fixed(line.taxableAmount, 2),
      lineTotal: fixed(line.lineTotal, 2),
      makeBrand: line.makeBrand,
    })),
  };
}

/** Finalised: recorded quotation lines. Draft / Cancelled: the chosen vendors' current submitted lines. */
function selectedValueOf(comparison: ComparisonWithRelations): string {
  let total = 0n;

  for (const line of comparison.lines) {
    if (line.selectedVendorId === null) {
      continue;
    }

    const amount =
      comparison.status === 'FINALISED'
        ? (line.quotationLine?.taxableAmount ?? null)
        : (line.enquiryLine.quotationLines.find(
            (row) => row.isQuoted && row.quotation.vendorId === line.selectedVendorId,
          )?.taxableAmount ?? null);

    if (amount !== null) {
      total += toScaled(amount.toFixed(2), 2);
    }
  }

  return formatScaled(total, 2);
}

export function toComparisonResponse(
  comparison: ComparisonWithRelations,
  flags: ComparisonFlags,
): ComparisonResponse {
  return {
    id: comparison.id,
    number: comparison.number,
    fiscalYear: comparison.fiscalYear,
    status: comparison.status,
    company: {
      id: comparison.company.id,
      code: comparison.company.code,
      name: comparison.company.legalName,
    },
    project: comparison.project,
    site: comparison.site,
    // A comparison exists only for a sent enquiry, which always has a number; '' only guards the type.
    enquiry: { id: comparison.enquiry.id, number: comparison.enquiry.number ?? '' },
    comparisonDate: isoDateOf(comparison.comparisonDate),
    remarks: comparison.remarks,
    lineCount: comparison.lines.length,
    selectedLineCount: comparison.lines.filter((line) => line.selectedVendorId !== null).length,
    selectedValue: selectedValueOf(comparison),
    finalisedAt: comparison.finalisedAt?.toISOString() ?? null,
    finalisedBy: comparison.finalisedBy,
    cancelledAt: comparison.cancelledAt?.toISOString() ?? null,
    cancelledBy: comparison.cancelledBy,
    cancelRemarks: comparison.cancelRemarks,
    createdBy: comparison.createdBy,
    createdAt: comparison.createdAt.toISOString(),
    updatedAt: comparison.updatedAt.toISOString(),
    ...flags,
  };
}

export function toComparisonDetailResponse(
  comparison: ComparisonWithRelations,
  flags: ComparisonFlags,
  grid: ComparisonGrid,
): ComparisonDetailResponse {
  const stored = new Map(comparison.lines.map((line) => [line.enquiryLineId, line]));

  return {
    ...toComparisonResponse(comparison, flags),
    vendors: grid.vendors,
    lines: grid.lines.map((line) => {
      const row = stored.get(line.enquiryLineId);

      return {
        ...line,
        selectedVendorId: row?.selectedVendorId ?? null,
        reason: row?.reason ?? null,
      };
    }),
  };
}

/** Readable values for the Audit Log: codes and numbers instead of ids. */
export function toComparisonAuditSnapshot(
  comparison: ComparisonWithRelations,
): Record<string, unknown> {
  return {
    number: comparison.number,
    fiscalYear: comparison.fiscalYear,
    status: comparison.status,
    enquiry: comparison.enquiry.number,
    project: comparison.project.code,
    site: comparison.site.code,
    comparisonDate: isoDateOf(comparison.comparisonDate),
    remarks: comparison.remarks,
    cancelRemarks: comparison.cancelRemarks,
    lines: comparison.lines.map((line) => ({
      lineNo: line.enquiryLine.lineNo,
      item: line.enquiryLine.item.code,
      vendor: line.selectedVendor?.code ?? null,
      reason: line.reason,
      netRate: fixed(line.netRate, 4),
      rank: line.rank,
    })),
    quotations: comparison.quotations.map((row) =>
      quotationNumberLabel(row.quotation.number ?? '', row.quotation.revisionNo),
    ),
  };
}
