import { z } from 'zod';
import { EnquiryItemSummary } from './enquiries';
import { IndentActorSummary, IndentScopeSummary, PositiveQuantitySchema } from './indents';
import { ISO_DATE_PATTERN } from './masters';
import {
  QUOTATION_AMOUNT_PATTERN,
  QUOTATION_PERCENT_PATTERN,
  QUOTATION_RATE_PATTERN,
} from './quotations';
import { OptionalText, optional } from './validators';

export const PURCHASE_ORDER_ERROR_CODES = [
  'INVALID_STATUS',
  'INVALID_COMPARISON',
  'DUPLICATE_PURCHASE_ORDER',
  'INVALID_PROJECT',
  'INVALID_SITE',
  'INVALID_STORE',
  'INVALID_VENDOR',
  'INVALID_VENDOR_GST',
  'INVALID_VENDOR_CONTACT',
  'BILLING_GST_MISSING',
  'INVALID_ITEM',
  'INVALID_LINES',
  'INVALID_DATE',
] as const;

export type PurchaseOrderErrorCode = (typeof PURCHASE_ORDER_ERROR_CODES)[number];

/** PO/TDV/2026-27/0001 until the client answers CQ-82 (OQ-81). */
export const PURCHASE_ORDER_NUMBER_PREFIX = 'PO';
export const PURCHASE_ORDER_NUMBER_DIGITS = 4;
export const MAX_PURCHASE_ORDER_LINES = 200;
export const MAX_PURCHASE_ORDER_CHARGES = 3;
export const MAX_PURCHASE_ORDER_TERMS = 20;

/** G-11 statuses (OQ-72). Approved / Rejected / Superseded are added with the approval ladder (G-12). */
export const PURCHASE_ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'CANCELLED'] as const;

export const PurchaseOrderStatus = z.enum(PURCHASE_ORDER_STATUSES);

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;

/** From a Finalised comparison, or direct without enquiry (OQ-68, OQ-82). Fixed at creation. */
export const PURCHASE_ORDER_SOURCES = ['COMPARISON', 'DIRECT'] as const;

export const PurchaseOrderSource = z.enum(PURCHASE_ORDER_SOURCES);

export type PurchaseOrderSource = z.infer<typeof PurchaseOrderSource>;

/** Same state as billing = CGST + SGST; different = IGST; unregistered vendor = none (OQ-71). Set by the API. */
export const PURCHASE_ORDER_TAX_TYPES = ['CGST_SGST', 'IGST', 'NONE'] as const;

export const PurchaseOrderTaxType = z.enum(PURCHASE_ORDER_TAX_TYPES);

export type PurchaseOrderTaxType = z.infer<typeof PurchaseOrderTaxType>;

export const PURCHASE_ORDER_CHARGE_TYPES = ['FREIGHT', 'LOADING_UNLOADING', 'OTHER'] as const;

export const PurchaseOrderChargeType = z.enum(PURCHASE_ORDER_CHARGE_TYPES);

export type PurchaseOrderChargeType = z.infer<typeof PurchaseOrderChargeType>;

/**
 * Default terms rows, from the client's PO sample (OQ-79). Payment Terms and Delivery text are filled
 * by the form from vendor payment days and delivery date. Wording pending client confirmation (CQ-112).
 */
export const PURCHASE_ORDER_DEFAULT_TERMS: readonly {
  title: string | null;
  text: string | null;
}[] = [
  { title: 'Taxes', text: 'Inclusive of GST @ 18% and all taxes.' },
  { title: 'Payment Terms', text: null },
  { title: 'Delivery', text: null },
  { title: 'Transportation', text: 'inclusive' },
  { title: null, text: 'Please quote PO No. in the invoice compulsorily' },
  {
    title: 'Unloading',
    text: 'Unloading of the material at our site will be done by us. You have to give prior intimation to our site before dispatching.',
  },
];

/** Rate (18,4), amount (18,2), percent (5,2) travel as strings (PD-006). */
const Rate = z.coerce.string().trim().regex(QUOTATION_RATE_PATTERN);
const Amount = z.coerce.string().trim().regex(QUOTATION_AMOUNT_PATTERN);
const Percent = z.coerce
  .string()
  .trim()
  .regex(QUOTATION_PERCENT_PATTERN)
  .refine((value) => Number(value) <= 100);

const IsoDate = z.string().regex(ISO_DATE_PATTERN);
const Days = z.coerce.number().int().min(0).max(365);

// ---------- Requests ----------

/**
 * comparisonLineId is required on a PO from a comparison and not allowed on a direct PO.
 * Qty may be lower or higher than the enquiry qty (OQ-69); rate / discount / GST % editable (OQ-77).
 * Blank discount = 0.
 */
export const PurchaseOrderLineInput = z.object({
  itemId: z.uuid(),
  comparisonLineId: optional(z.uuid()),
  quantity: PositiveQuantitySchema,
  rate: Rate,
  discountPercent: optional(Percent),
  gstRate: Percent,
  remarks: OptionalText(300),
});

export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineInput>;

export const PurchaseOrderChargeInput = z.object({
  chargeType: PurchaseOrderChargeType,
  description: OptionalText(120),
  amount: Amount,
  gstRate: Percent,
});

export type PurchaseOrderChargeInput = z.infer<typeof PurchaseOrderChargeInput>;

/** A terms row needs a title or a text (sample clauses 5 and 6 have no title). */
export const PurchaseOrderTermInput = z
  .object({
    title: OptionalText(60),
    text: OptionalText(1000),
  })
  .refine((term) => term.title !== null || term.text !== null, {
    message: 'Enter a title or text',
    path: ['text'],
  });

export type PurchaseOrderTermInput = z.infer<typeof PurchaseOrderTermInput>;

function checkPurchaseOrder(
  value: {
    source?: PurchaseOrderSource;
    poDate: string;
    vendorQuoteDate: string | null;
    deliveryDate: string | null;
    lines: { itemId: string; comparisonLineId: string | null }[];
    charges: { chargeType: PurchaseOrderChargeType; description: string | null }[];
  },
  ctx: z.RefinementCtx,
): void {
  const seenComparisonLines = new Set<string>();
  const seenDirectItems = new Set<string>();

  value.lines.forEach((line, index) => {
    if (line.comparisonLineId === null) {
      if (value.source === 'COMPARISON') {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'comparisonLineId'],
          message: 'Comparison line required',
        });
      }

      if (seenDirectItems.has(line.itemId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'itemId'],
          message: 'Item repeated',
        });
      }

      seenDirectItems.add(line.itemId);
      return;
    }

    if (value.source === 'DIRECT') {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', index, 'comparisonLineId'],
        message: 'Not allowed on a direct purchase order',
      });
    }

    if (seenComparisonLines.has(line.comparisonLineId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', index, 'comparisonLineId'],
        message: 'Comparison line repeated',
      });
    }

    seenComparisonLines.add(line.comparisonLineId);
  });

  if (value.deliveryDate !== null && value.deliveryDate < value.poDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['deliveryDate'],
      message: 'Delivery date is before the PO date',
    });
  }

  if (value.vendorQuoteDate !== null && value.vendorQuoteDate > value.poDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['vendorQuoteDate'],
      message: 'Quotation date is after the PO date',
    });
  }

  const seenCharges = new Set<string>();

  value.charges.forEach((charge, index) => {
    if (seenCharges.has(charge.chargeType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['charges', index, 'chargeType'],
        message: 'Charge repeated',
      });
    }

    seenCharges.add(charge.chargeType);

    if (charge.chargeType === 'OTHER' && charge.description === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['charges', index, 'description'],
        message: 'Describe the other charge',
      });
    }
  });
}

/**
 * Number, status, company, billing GST, tax type and totals are set by the API.
 * The whole line, charge and terms lists are sent on every save.
 */
export const PurchaseOrderFields = z.object({
  storeId: optional(z.uuid()),
  vendorGstRegistrationId: optional(z.uuid()),
  vendorContactId: optional(z.uuid()),
  poDate: IsoDate,
  /** "supply of the following ___" on the print (OQ-80). */
  subject: z.string().trim().min(1).max(200),
  vendorQuoteRef: OptionalText(60),
  vendorQuoteDate: optional(IsoDate),
  deliveryDate: optional(IsoDate),
  paymentTermsDays: optional(Days),
  remarks: OptionalText(500),
  lines: z.array(PurchaseOrderLineInput).min(1).max(MAX_PURCHASE_ORDER_LINES),
  charges: z.array(PurchaseOrderChargeInput).max(MAX_PURCHASE_ORDER_CHARGES),
  terms: z.array(PurchaseOrderTermInput).max(MAX_PURCHASE_ORDER_TERMS),
});

/** Project, site and vendor come from the comparison (OQ-70). */
export const CreatePurchaseOrderFromComparison = PurchaseOrderFields.extend({
  source: z.literal('COMPARISON'),
  comparisonId: z.uuid(),
  vendorId: z.uuid(),
});

export const CreateDirectPurchaseOrder = PurchaseOrderFields.extend({
  source: z.literal('DIRECT'),
  projectId: z.uuid(),
  siteId: z.uuid(),
  vendorId: z.uuid(),
});

export const CreatePurchaseOrderRequest = z
  .discriminatedUnion('source', [CreatePurchaseOrderFromComparison, CreateDirectPurchaseOrder])
  .superRefine(checkPurchaseOrder);

export type CreatePurchaseOrderRequest = z.infer<typeof CreatePurchaseOrderRequest>;

/** Source, comparison, project, site and vendor are fixed at creation. */
export const UpdatePurchaseOrderRequest = PurchaseOrderFields.superRefine(checkPurchaseOrder);

export type UpdatePurchaseOrderRequest = z.infer<typeof UpdatePurchaseOrderRequest>;

export const CancelPurchaseOrderRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type CancelPurchaseOrderRequest = z.infer<typeof CancelPurchaseOrderRequest>;

export const PurchaseOrderListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  projectId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  source: PurchaseOrderSource.optional(),
  status: PurchaseOrderStatus.optional(),
  fromDate: IsoDate.optional(),
  toDate: IsoDate.optional(),
  sortBy: z.enum(['number', 'poDate', 'grandTotal', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type PurchaseOrderListQuery = z.infer<typeof PurchaseOrderListQuery>;

// ---------- Responses ----------

/** Values from the comparison's chosen quotation line, for the "Enquiry qty" / "Quoted" hints (OQ-69, OQ-77). */
export const PurchaseOrderLineReference = z.object({
  enquiryQuantity: z.string(),
  quotedRate: z.string(),
  quotedDiscountPercent: z.string(),
  quotedGstRate: z.string(),
});

export type PurchaseOrderLineReference = z.infer<typeof PurchaseOrderLineReference>;

export const PurchaseOrderLineResponse = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  item: EnquiryItemSummary,
  comparisonLineId: z.uuid().nullable(),
  quantity: z.string(),
  rate: z.string(),
  discountPercent: z.string(),
  gstRate: z.string(),
  taxableAmount: z.string(),
  cgstAmount: z.string(),
  sgstAmount: z.string(),
  igstAmount: z.string(),
  lineTotal: z.string(),
  remarks: z.string().nullable(),
  /** Null on a direct PO. */
  reference: PurchaseOrderLineReference.nullable(),
});

export type PurchaseOrderLineResponse = z.infer<typeof PurchaseOrderLineResponse>;

export const PurchaseOrderChargeResponse = z.object({
  id: z.uuid(),
  chargeType: PurchaseOrderChargeType,
  description: z.string().nullable(),
  amount: z.string(),
  gstRate: z.string(),
  cgstAmount: z.string(),
  sgstAmount: z.string(),
  igstAmount: z.string(),
});

export type PurchaseOrderChargeResponse = z.infer<typeof PurchaseOrderChargeResponse>;

export const PurchaseOrderTermResponse = z.object({
  id: z.uuid(),
  sortOrder: z.number().int(),
  title: z.string().nullable(),
  text: z.string().nullable(),
});

export type PurchaseOrderTermResponse = z.infer<typeof PurchaseOrderTermResponse>;

export const PurchaseOrderResponse = z.object({
  id: z.uuid(),
  /** Null only for a first-time Draft (PD-003). */
  number: z.string().nullable(),
  revisionNo: z.number().int(),
  revisedFromId: z.uuid().nullable(),
  fiscalYear: z.string().nullable(),
  status: PurchaseOrderStatus,
  source: PurchaseOrderSource,
  company: IndentScopeSummary,
  project: IndentScopeSummary,
  site: IndentScopeSummary,
  store: IndentScopeSummary.nullable(),
  comparison: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  enquiry: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  vendor: z.object({ id: z.uuid(), code: z.string(), legalName: z.string() }),
  vendorGstin: z.string().nullable(),
  vendorContactName: z.string().nullable(),
  billingGstin: z.string(),
  taxType: PurchaseOrderTaxType,
  poDate: z.string(),
  subject: z.string(),
  vendorQuoteRef: z.string().nullable(),
  vendorQuoteDate: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  remarks: z.string().nullable(),
  /** Sum of line taxable amounts. */
  subtotal: z.string(),
  /** Sum of charge amounts before GST. */
  chargesAmount: z.string(),
  cgstTotal: z.string(),
  sgstTotal: z.string(),
  igstTotal: z.string(),
  taxTotal: z.string(),
  grandTotal: z.string(),
  lineCount: z.number().int(),
  submittedAt: z.string().nullable(),
  submittedBy: IndentActorSummary.nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: IndentActorSummary.nullable(),
  cancelRemarks: z.string().nullable(),
  createdBy: IndentActorSummary,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Draft, and the user may edit and submit it. */
  canEdit: z.boolean(),
  /** Draft or Submitted, and the user may cancel it. */
  canCancel: z.boolean(),
});

export type PurchaseOrderResponse = z.infer<typeof PurchaseOrderResponse>;

export const PurchaseOrderDetailResponse = PurchaseOrderResponse.extend({
  lines: z.array(PurchaseOrderLineResponse),
  charges: z.array(PurchaseOrderChargeResponse),
  terms: z.array(PurchaseOrderTermResponse),
});

export type PurchaseOrderDetailResponse = z.infer<typeof PurchaseOrderDetailResponse>;

export const PagedPurchaseOrdersResponse = z.object({
  items: z.array(PurchaseOrderResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedPurchaseOrdersResponse = z.infer<typeof PagedPurchaseOrdersResponse>;
