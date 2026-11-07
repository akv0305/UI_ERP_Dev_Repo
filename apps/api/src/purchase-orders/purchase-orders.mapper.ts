import type { Prisma } from '@prisma/client';
import type {
  PurchaseOrderChargeResponse,
  PurchaseOrderDetailResponse,
  PurchaseOrderLineResponse,
  PurchaseOrderResponse,
  PurchaseOrderTermResponse,
} from '@uie/contracts';
import { isoDateOf } from '../indents/indents.mapper';
import type { PurchaseOrderFlags } from './purchase-order-rules';

const actorSelect = { select: { id: true, displayName: true } } as const;
const scopeSelect = { select: { id: true, code: true, name: true } } as const;

export const purchaseOrderInclude = {
  company: { select: { id: true, code: true, legalName: true } },
  project: scopeSelect,
  site: scopeSelect,
  store: scopeSelect,
  comparison: {
    select: { id: true, number: true, enquiry: { select: { id: true, number: true } } },
  },
  vendor: { select: { id: true, code: true, legalName: true } },
  vendorGst: { select: { gstin: true } },
  vendorContact: { select: { name: true } },
  billingGst: { select: { gstin: true } },
  submittedBy: actorSelect,
  cancelledBy: actorSelect,
  createdBy: actorSelect,
  _count: { select: { lines: true } },
} satisfies Prisma.PurchaseOrderInclude;

export const purchaseOrderDetailInclude = {
  ...purchaseOrderInclude,
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
      comparisonLine: {
        select: {
          enquiryLine: { select: { quantity: true } },
          quotationLine: { select: { rate: true, discountPercent: true, gstRate: true } },
        },
      },
    },
  },
  charges: { orderBy: { chargeType: 'asc' } },
  terms: { orderBy: { sortOrder: 'asc' } },
  approvalSteps: {
    orderBy: [{ cycleNo: 'asc' }, { levelNo: 'asc' }],
    select: {
      cycleNo: true,
      levelNo: true,
      status: true,
      decision: true,
      remarks: true,
      role: { select: { code: true } },
      approver: { select: { displayName: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

export type PurchaseOrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderInclude;
}>;
export type PurchaseOrderWithDetails = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderDetailInclude;
}>;

type PurchaseOrderLineRow = PurchaseOrderWithDetails['lines'][number];
type PurchaseOrderChargeRow = PurchaseOrderWithDetails['charges'][number];
type PurchaseOrderTermRow = PurchaseOrderWithDetails['terms'][number];

function optionalDate(value: Date | null): string | null {
  return value === null ? null : isoDateOf(value);
}

export function toPurchaseOrderResponse(
  purchaseOrder: PurchaseOrderWithRelations,
  flags: PurchaseOrderFlags,
): PurchaseOrderResponse {
  const comparison = purchaseOrder.comparison;

  return {
    id: purchaseOrder.id,
    number: purchaseOrder.number,
    revisionNo: purchaseOrder.revisionNo,
    revisedFromId: purchaseOrder.revisedFromId,
    fiscalYear: purchaseOrder.fiscalYear,
    status: purchaseOrder.status,
    source: purchaseOrder.source,
    company: {
      id: purchaseOrder.company.id,
      code: purchaseOrder.company.code,
      name: purchaseOrder.company.legalName,
    },
    project: purchaseOrder.project,
    site: purchaseOrder.site,
    store: purchaseOrder.store,
    // A PO is made only from a Finalised comparison of a Sent enquiry, both numbered; '' only guards the type.
    comparison: comparison === null ? null : { id: comparison.id, number: comparison.number ?? '' },
    enquiry:
      comparison === null
        ? null
        : { id: comparison.enquiry.id, number: comparison.enquiry.number ?? '' },
    vendor: purchaseOrder.vendor,
    vendorGstRegistrationId: purchaseOrder.vendorGstRegistrationId,
    vendorGstin: purchaseOrder.vendorGst?.gstin ?? null,
    vendorContactId: purchaseOrder.vendorContactId,
    vendorContactName: purchaseOrder.vendorContact?.name ?? null,
    billingGstin: purchaseOrder.billingGst.gstin,
    taxType: purchaseOrder.taxType,
    poDate: isoDateOf(purchaseOrder.poDate),
    subject: purchaseOrder.subject,
    vendorQuoteRef: purchaseOrder.vendorQuoteRef,
    vendorQuoteDate: optionalDate(purchaseOrder.vendorQuoteDate),
    deliveryDate: optionalDate(purchaseOrder.deliveryDate),
    paymentTermsDays: purchaseOrder.paymentTermsDays,
    remarks: purchaseOrder.remarks,
    subtotal: purchaseOrder.subtotal.toFixed(2),
    chargesAmount: purchaseOrder.chargesAmount.toFixed(2),
    cgstTotal: purchaseOrder.cgstTotal.toFixed(2),
    sgstTotal: purchaseOrder.sgstTotal.toFixed(2),
    igstTotal: purchaseOrder.igstTotal.toFixed(2),
    taxTotal: purchaseOrder.taxTotal.toFixed(2),
    grandTotal: purchaseOrder.grandTotal.toFixed(2),
    lineCount: purchaseOrder._count.lines,
    submittedAt: purchaseOrder.submittedAt?.toISOString() ?? null,
    submittedBy: purchaseOrder.submittedBy,
    cancelledAt: purchaseOrder.cancelledAt?.toISOString() ?? null,
    cancelledBy: purchaseOrder.cancelledBy,
    cancelRemarks: purchaseOrder.cancelRemarks,
    createdBy: purchaseOrder.createdBy,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
    ...flags,
  };
}

/** Quoted values for the "Enquiry qty" / "Quoted" hints (OQ-69, OQ-77); null on a direct PO. */
function referenceOf(
  row: PurchaseOrderLineRow,
  places: number,
): PurchaseOrderLineResponse['reference'] {
  const quoted = row.comparisonLine?.quotationLine ?? null;

  if (
    row.comparisonLine === null ||
    quoted === null ||
    quoted.rate === null ||
    quoted.gstRate === null
  ) {
    return null;
  }

  return {
    enquiryQuantity: row.comparisonLine.enquiryLine.quantity.toFixed(places),
    quotedRate: quoted.rate.toFixed(4),
    quotedDiscountPercent: quoted.discountPercent?.toFixed(2) ?? '0.00',
    quotedGstRate: quoted.gstRate.toFixed(2),
  };
}

export function toPurchaseOrderLineResponse(row: PurchaseOrderLineRow): PurchaseOrderLineResponse {
  const places = row.item.unit.decimalPlaces;

  return {
    id: row.id,
    lineNo: row.lineNo,
    item: {
      id: row.item.id,
      code: row.item.code,
      description: row.item.description,
      size: row.item.size,
      unitCode: row.item.unit.code,
      decimalPlaces: places,
    },
    comparisonLineId: row.comparisonLineId,
    quantity: row.quantity.toFixed(places),
    rate: row.rate.toFixed(4),
    discountPercent: row.discountPercent.toFixed(2),
    gstRate: row.gstRate.toFixed(2),
    taxableAmount: row.taxableAmount.toFixed(2),
    cgstAmount: row.cgstAmount.toFixed(2),
    sgstAmount: row.sgstAmount.toFixed(2),
    igstAmount: row.igstAmount.toFixed(2),
    lineTotal: row.lineTotal.toFixed(2),
    remarks: row.remarks,
    reference: referenceOf(row, places),
  };
}

export function toPurchaseOrderChargeResponse(
  row: PurchaseOrderChargeRow,
): PurchaseOrderChargeResponse {
  return {
    id: row.id,
    chargeType: row.chargeType,
    description: row.description,
    amount: row.amount.toFixed(2),
    gstRate: row.gstRate.toFixed(2),
    cgstAmount: row.cgstAmount.toFixed(2),
    sgstAmount: row.sgstAmount.toFixed(2),
    igstAmount: row.igstAmount.toFixed(2),
  };
}

export function toPurchaseOrderTermResponse(row: PurchaseOrderTermRow): PurchaseOrderTermResponse {
  return { id: row.id, sortOrder: row.sortOrder, title: row.title, text: row.text };
}

export function toPurchaseOrderDetailResponse(
  purchaseOrder: PurchaseOrderWithDetails,
  flags: PurchaseOrderFlags,
): PurchaseOrderDetailResponse {
  return {
    ...toPurchaseOrderResponse(purchaseOrder, flags),
    lines: purchaseOrder.lines.map(toPurchaseOrderLineResponse),
    charges: purchaseOrder.charges.map(toPurchaseOrderChargeResponse),
    terms: purchaseOrder.terms.map(toPurchaseOrderTermResponse),
  };
}

/** Readable values for the Audit Log: codes and numbers instead of ids. */
export function toPurchaseOrderAuditSnapshot(
  purchaseOrder: PurchaseOrderWithDetails,
): Record<string, unknown> {
  return {
    number: purchaseOrder.number,
    revisionNo: purchaseOrder.revisionNo,
    fiscalYear: purchaseOrder.fiscalYear,
    status: purchaseOrder.status,
    source: purchaseOrder.source,
    comparison: purchaseOrder.comparison?.number ?? null,
    project: purchaseOrder.project.code,
    site: purchaseOrder.site.code,
    store: purchaseOrder.store?.code ?? null,
    vendor: purchaseOrder.vendor.code,
    vendorGstin: purchaseOrder.vendorGst?.gstin ?? null,
    vendorContact: purchaseOrder.vendorContact?.name ?? null,
    billingGstin: purchaseOrder.billingGst.gstin,
    taxType: purchaseOrder.taxType,
    poDate: isoDateOf(purchaseOrder.poDate),
    subject: purchaseOrder.subject,
    vendorQuoteRef: purchaseOrder.vendorQuoteRef,
    vendorQuoteDate: optionalDate(purchaseOrder.vendorQuoteDate),
    deliveryDate: optionalDate(purchaseOrder.deliveryDate),
    paymentTermsDays: purchaseOrder.paymentTermsDays,
    remarks: purchaseOrder.remarks,
    subtotal: purchaseOrder.subtotal.toFixed(2),
    chargesAmount: purchaseOrder.chargesAmount.toFixed(2),
    taxTotal: purchaseOrder.taxTotal.toFixed(2),
    grandTotal: purchaseOrder.grandTotal.toFixed(2),
    cancelRemarks: purchaseOrder.cancelRemarks,
    approvalCycle: purchaseOrder.approvalCycle,
    approvedAt: purchaseOrder.approvedAt?.toISOString() ?? null,
    approvalSteps: purchaseOrder.approvalSteps
      .filter((step) => step.cycleNo === purchaseOrder.approvalCycle)
      .map((step) => ({
        levelNo: step.levelNo,
        role: step.role.code,
        status: step.status,
        approver: step.approver?.displayName ?? null,
        decision: step.decision,
        remarks: step.remarks,
      })),
    lines: purchaseOrder.lines.map((line) => ({
      lineNo: line.lineNo,
      item: line.item.code,
      quantity: line.quantity.toFixed(3),
      rate: line.rate.toFixed(4),
      discountPercent: line.discountPercent.toFixed(2),
      gstRate: line.gstRate.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
      remarks: line.remarks,
    })),
    charges: purchaseOrder.charges.map((charge) => ({
      chargeType: charge.chargeType,
      description: charge.description,
      amount: charge.amount.toFixed(2),
      gstRate: charge.gstRate.toFixed(2),
    })),
    terms: purchaseOrder.terms.map((term) => ({ title: term.title, text: term.text })),
  };
}
