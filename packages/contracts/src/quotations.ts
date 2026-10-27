import { z } from 'zod';
import { EnquiryItemSummary, MAX_ENQUIRY_LINES } from './enquiries';
import { IndentActorSummary, IndentScopeSummary } from './indents';
import { ISO_DATE_PATTERN } from './masters';
import { OptionalText, optional } from './validators';

export const QUOTATION_ERROR_CODES = [
  'INVALID_STATUS',
  'INVALID_ENQUIRY',
  'INVALID_VENDOR',
  'DUPLICATE_QUOTATION',
  'INVALID_LINES',
  'INVALID_DATE',
] as const;

export type QuotationErrorCode = (typeof QUOTATION_ERROR_CODES)[number];

export const QUOTATION_NUMBER_PREFIX = 'QTN';
export const QUOTATION_NUMBER_DIGITS = 4;
export const MAX_QUOTATION_CHARGES = 3;

/** Superseded = an older revision replaced by a newer submitted one (OQ-54). */
export const QUOTATION_STATUSES = ['DRAFT', 'SUBMITTED', 'SUPERSEDED', 'CANCELLED'] as const;

export const QuotationStatus = z.enum(QUOTATION_STATUSES);

export type QuotationStatus = z.infer<typeof QuotationStatus>;

/** Header-level charges, each with its own GST % (OQ-56). */
export const QUOTATION_CHARGE_TYPES = ['FREIGHT', 'LOADING_UNLOADING', 'OTHER'] as const;

export const QuotationChargeType = z.enum(QUOTATION_CHARGE_TYPES);

export type QuotationChargeType = z.infer<typeof QuotationChargeType>;

/** Rate (18,4), amount (18,2) and percent (5,2) travel as strings, never floats (PD-006). */
export const QUOTATION_RATE_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;
export const QUOTATION_AMOUNT_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;
export const QUOTATION_PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

const QuotationRate = z.coerce.string().trim().regex(QUOTATION_RATE_PATTERN);
const QuotationAmount = z.coerce.string().trim().regex(QUOTATION_AMOUNT_PATTERN);
const QuotationPercent = z.coerce
  .string()
  .trim()
  .regex(QUOTATION_PERCENT_PATTERN)
  .refine((value) => Number(value) <= 100);

const IsoDate = z.string().regex(ISO_DATE_PATTERN);
const Days = z.coerce.number().int().min(0).max(365);

/** QTN/TDV/2026-27/0001, or QTN/TDV/2026-27/0001-R1 for a revision. */
export function quotationNumberLabel(number: string, revisionNo: number): string {
  return revisionNo === 0 ? number : `${number}-R${revisionNo}`;
}

// ---------- Requests ----------

/** One row per enquiry line. A quoted line needs rate and GST %; discount blank = 0. */
export const QuotationLineInput = z
  .object({
    enquiryLineId: z.uuid(),
    isQuoted: z.boolean(),
    rate: optional(QuotationRate),
    discountPercent: optional(QuotationPercent),
    gstRate: optional(QuotationPercent),
    makeBrand: OptionalText(120),
    remarks: OptionalText(300),
  })
  .superRefine((line, ctx) => {
    if (!line.isQuoted) {
      return;
    }

    if (line.rate === null) {
      ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Rate required' });
    }

    if (line.gstRate === null) {
      ctx.addIssue({ code: 'custom', path: ['gstRate'], message: 'GST % required' });
    }
  });

export type QuotationLineInput = z.infer<typeof QuotationLineInput>;

export const QuotationChargeInput = z.object({
  chargeType: QuotationChargeType,
  description: OptionalText(120),
  amount: QuotationAmount,
  gstRate: QuotationPercent,
});

export type QuotationChargeInput = z.infer<typeof QuotationChargeInput>;

function checkQuotation(
  value: {
    quoteDate: string;
    validUntil: string | null;
    lines: { enquiryLineId: string; isQuoted: boolean }[];
    charges: { chargeType: QuotationChargeType; description: string | null }[];
  },
  ctx: z.RefinementCtx,
): void {
  const seenLines = new Set<string>();

  value.lines.forEach((line, index) => {
    if (seenLines.has(line.enquiryLineId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', index, 'enquiryLineId'],
        message: 'Enquiry line repeated',
      });
    }

    seenLines.add(line.enquiryLineId);
  });

  if (!value.lines.some((line) => line.isQuoted)) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Quote at least one line' });
  }

  if (value.validUntil !== null && value.validUntil < value.quoteDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['validUntil'],
      message: 'Valid-until date is before the quote date',
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

/** Number, status, totals, project and site are set by the API. Every enquiry line is sent on every save. */
export const QuotationFields = z.object({
  vendorQuoteRef: OptionalText(60),
  quoteDate: IsoDate,
  validUntil: optional(IsoDate),
  deliveryDays: optional(Days),
  paymentTermsDays: optional(Days),
  remarks: OptionalText(500),
  lines: z.array(QuotationLineInput).min(1).max(MAX_ENQUIRY_LINES),
  charges: z.array(QuotationChargeInput).max(MAX_QUOTATION_CHARGES),
});

/** Enquiry and vendor are fixed at creation. */
export const CreateQuotationRequest = QuotationFields.extend({
  enquiryId: z.uuid(),
  vendorId: z.uuid(),
}).superRefine(checkQuotation);

export type CreateQuotationRequest = z.infer<typeof CreateQuotationRequest>;

export const UpdateQuotationRequest = QuotationFields.superRefine(checkQuotation);

export type UpdateQuotationRequest = z.infer<typeof UpdateQuotationRequest>;

export const CancelQuotationRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type CancelQuotationRequest = z.infer<typeof CancelQuotationRequest>;

export const QuotationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  projectId: z.uuid().optional(),
  enquiryId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  status: QuotationStatus.optional(),
  sortBy: z.enum(['number', 'quoteDate', 'grandTotal', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type QuotationListQuery = z.infer<typeof QuotationListQuery>;

// ---------- Responses ----------

export const QuotationLineResponse = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  enquiryLineId: z.uuid(),
  item: EnquiryItemSummary,
  quantity: z.string(),
  isQuoted: z.boolean(),
  rate: z.string().nullable(),
  discountPercent: z.string().nullable(),
  gstRate: z.string().nullable(),
  taxableAmount: z.string().nullable(),
  taxAmount: z.string().nullable(),
  lineTotal: z.string().nullable(),
  makeBrand: z.string().nullable(),
  remarks: z.string().nullable(),
});

export type QuotationLineResponse = z.infer<typeof QuotationLineResponse>;

export const QuotationChargeResponse = z.object({
  id: z.uuid(),
  chargeType: QuotationChargeType,
  description: z.string().nullable(),
  amount: z.string(),
  gstRate: z.string(),
  taxAmount: z.string(),
});

export type QuotationChargeResponse = z.infer<typeof QuotationChargeResponse>;

export const QuotationResponse = z.object({
  id: z.uuid(),
  /** Null only for a first-time Draft (PD-003). */
  number: z.string().nullable(),
  revisionNo: z.number().int(),
  revisedFromId: z.uuid().nullable(),
  fiscalYear: z.string().nullable(),
  status: QuotationStatus,
  company: IndentScopeSummary,
  project: IndentScopeSummary,
  site: IndentScopeSummary,
  enquiry: z.object({ id: z.uuid(), number: z.string() }),
  vendor: z.object({ id: z.uuid(), code: z.string(), legalName: z.string() }),
  vendorQuoteRef: z.string().nullable(),
  quoteDate: z.string(),
  validUntil: z.string().nullable(),
  deliveryDays: z.number().int().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  remarks: z.string().nullable(),
  /** Sum of line taxable amounts. */
  subtotal: z.string(),
  /** Sum of line GST. */
  taxTotal: z.string(),
  /** Charges plus their GST. */
  chargesTotal: z.string(),
  grandTotal: z.string(),
  lineCount: z.number().int(),
  quotedLineCount: z.number().int(),
  submittedAt: z.string().nullable(),
  submittedBy: IndentActorSummary.nullable(),
  supersededAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: IndentActorSummary.nullable(),
  cancelRemarks: z.string().nullable(),
  createdBy: IndentActorSummary,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Draft, and the user may edit and submit it. */
  canEdit: z.boolean(),
  /** Submitted, enquiry still Sent, no open draft revision, and the user may revise it. */
  canRevise: z.boolean(),
  /** Draft or Submitted, and the user may cancel it. */
  canCancel: z.boolean(),
});

export type QuotationResponse = z.infer<typeof QuotationResponse>;

export const QuotationDetailResponse = QuotationResponse.extend({
  lines: z.array(QuotationLineResponse),
  charges: z.array(QuotationChargeResponse),
});

export type QuotationDetailResponse = z.infer<typeof QuotationDetailResponse>;

export const PagedQuotationsResponse = z.object({
  items: z.array(QuotationResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedQuotationsResponse = z.infer<typeof PagedQuotationsResponse>;

// ---------- Option lists for the quotation form ----------

export const QuotationEnquiryOptionsQuery = z.object({
  search: z.string().trim().max(120).optional(),
});

export type QuotationEnquiryOptionsQuery = z.infer<typeof QuotationEnquiryOptionsQuery>;

/** Sent enquiries where the user holds purchase.quotations.manage. */
export const QuotationEnquiryOptionsResponse = z.object({
  enquiries: z.array(z.object({ id: z.uuid(), label: z.string() })),
});

export type QuotationEnquiryOptionsResponse = z.infer<typeof QuotationEnquiryOptionsResponse>;

/** Everything the form needs for one enquiry; defaultGstRate comes from the item master. */
export const QuotationEnquiryFormResponse = z.object({
  enquiry: z.object({
    id: z.uuid(),
    number: z.string(),
    quoteDueDate: z.string(),
    project: IndentScopeSummary,
    site: IndentScopeSummary,
  }),
  vendors: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      /** A Draft or Submitted quotation already exists for this vendor. */
      hasQuotation: z.boolean(),
    }),
  ),
  lines: z.array(
    z.object({
      enquiryLineId: z.uuid(),
      lineNo: z.number().int(),
      item: EnquiryItemSummary,
      quantity: z.string(),
      defaultGstRate: z.string().nullable(),
    }),
  ),
});

export type QuotationEnquiryFormResponse = z.infer<typeof QuotationEnquiryFormResponse>;
