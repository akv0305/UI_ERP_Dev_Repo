import { z } from 'zod';
import { EnquiryItemSummary, MAX_ENQUIRY_LINES } from './enquiries';
import { IndentActorSummary, IndentScopeSummary } from './indents';
import { ISO_DATE_PATTERN } from './masters';
import { OptionalText, optional } from './validators';

export const COMPARISON_ERROR_CODES = [
  'INVALID_STATUS',
  'INVALID_ENQUIRY',
  'DUPLICATE_COMPARISON',
  'INVALID_LINES',
  'INVALID_SELECTION',
  'REASON_REQUIRED',
  'NOTHING_SELECTED',
  'INVALID_DATE',
] as const;

export type ComparisonErrorCode = (typeof COMPARISON_ERROR_CODES)[number];

export const COMPARISON_NUMBER_PREFIX = 'CMP';
export const COMPARISON_NUMBER_DIGITS = 4;

/** Finalised = vendor choice recorded and the enquiry closed (OQ-65). */
export const COMPARISON_STATUSES = ['DRAFT', 'FINALISED', 'CANCELLED'] as const;

export const ComparisonStatus = z.enum(COMPARISON_STATUSES);

export type ComparisonStatus = z.infer<typeof ComparisonStatus>;

const IsoDate = z.string().regex(ISO_DATE_PATTERN);

// ---------- Requests ----------

/** One row per enquiry line. No vendor = line not awarded. Reason is required by the API when the vendor is not L1 (OQ-63). */
export const ComparisonLineInput = z.object({
  enquiryLineId: z.uuid(),
  selectedVendorId: optional(z.uuid()),
  reason: OptionalText(300),
});

export type ComparisonLineInput = z.infer<typeof ComparisonLineInput>;

function checkComparison(
  value: {
    lines: { enquiryLineId: string; selectedVendorId: string | null; reason: string | null }[];
  },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();

  value.lines.forEach((line, index) => {
    if (seen.has(line.enquiryLineId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', index, 'enquiryLineId'],
        message: 'Enquiry line repeated',
      });
    }

    seen.add(line.enquiryLineId);

    if (line.selectedVendorId === null && line.reason !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', index, 'reason'],
        message: 'Choose a vendor before giving a reason',
      });
    }
  });
}

/** Number, status, company, project and site are set by the API. Every enquiry line is sent on every save. */
export const ComparisonFields = z.object({
  comparisonDate: IsoDate,
  remarks: OptionalText(500),
  lines: z.array(ComparisonLineInput).min(1).max(MAX_ENQUIRY_LINES),
});

/** The enquiry is fixed at creation. */
export const CreateComparisonRequest = ComparisonFields.extend({
  enquiryId: z.uuid(),
}).superRefine(checkComparison);

export type CreateComparisonRequest = z.infer<typeof CreateComparisonRequest>;

export const UpdateComparisonRequest = ComparisonFields.superRefine(checkComparison);

export type UpdateComparisonRequest = z.infer<typeof UpdateComparisonRequest>;

export const CancelComparisonRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type CancelComparisonRequest = z.infer<typeof CancelComparisonRequest>;

export const ComparisonListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  projectId: z.uuid().optional(),
  enquiryId: z.uuid().optional(),
  status: ComparisonStatus.optional(),
  sortBy: z.enum(['number', 'comparisonDate', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ComparisonListQuery = z.infer<typeof ComparisonListQuery>;

// ---------- Grid (shared by the new form and the detail page) ----------

/** One compared quotation: the latest Submitted one per vendor (OQ-64). */
export const ComparisonVendorColumn = z.object({
  quotationId: z.uuid(),
  /** QTN/TDV/2026-27/0001 or ...-R1. */
  quotationLabel: z.string(),
  vendor: z.object({ id: z.uuid(), code: z.string(), legalName: z.string() }),
  quoteDate: z.string(),
  validUntil: z.string().nullable(),
  /** Valid-until is before the comparison date: shown as a warning, not excluded (OQ-64). */
  isExpired: z.boolean(),
  deliveryDays: z.number().int().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  subtotal: z.string(),
  taxTotal: z.string(),
  chargesTotal: z.string(),
  grandTotal: z.string(),
});

export type ComparisonVendorColumn = z.infer<typeof ComparisonVendorColumn>;

/** One vendor's offer on one line. Unquoted lines have null amounts and rank. */
export const ComparisonOffer = z.object({
  vendorId: z.uuid(),
  quotationLineId: z.uuid(),
  isQuoted: z.boolean(),
  rate: z.string().nullable(),
  discountPercent: z.string().nullable(),
  /** rate x (100 - discount) / 100, half-up to 4 decimals, GST excluded (OQ-62). */
  netRate: z.string().nullable(),
  gstRate: z.string().nullable(),
  taxableAmount: z.string().nullable(),
  lineTotal: z.string().nullable(),
  makeBrand: z.string().nullable(),
  /** 1 = L1. Equal net rates share a rank. */
  rank: z.number().int().nullable(),
});

export type ComparisonOffer = z.infer<typeof ComparisonOffer>;

export const ComparisonGridLine = z.object({
  enquiryLineId: z.uuid(),
  lineNo: z.number().int(),
  item: EnquiryItemSummary,
  quantity: z.string(),
  offers: z.array(ComparisonOffer),
});

export type ComparisonGridLine = z.infer<typeof ComparisonGridLine>;

/** For a new comparison: Sent enquiries with at least one Submitted quotation and no open comparison. */
export const ComparisonEnquiryOptionsQuery = z.object({
  search: z.string().trim().max(120).optional(),
});

export type ComparisonEnquiryOptionsQuery = z.infer<typeof ComparisonEnquiryOptionsQuery>;

export const ComparisonEnquiryOptionsResponse = z.object({
  enquiries: z.array(z.object({ id: z.uuid(), label: z.string() })),
});

export type ComparisonEnquiryOptionsResponse = z.infer<typeof ComparisonEnquiryOptionsResponse>;

export const ComparisonGridQuery = z.object({
  enquiryId: z.uuid(),
  /** Used for the expiry warning; defaults to today (IST). */
  comparisonDate: IsoDate.optional(),
});

export type ComparisonGridQuery = z.infer<typeof ComparisonGridQuery>;

export const ComparisonGridResponse = z.object({
  enquiry: z.object({
    id: z.uuid(),
    number: z.string(),
    enquiryDate: z.string(),
    quoteDueDate: z.string(),
    project: IndentScopeSummary,
    site: IndentScopeSummary,
  }),
  vendors: z.array(ComparisonVendorColumn),
  lines: z.array(ComparisonGridLine),
});

export type ComparisonGridResponse = z.infer<typeof ComparisonGridResponse>;

// ---------- Responses ----------

export const ComparisonResponse = z.object({
  id: z.uuid(),
  /** Null while Draft (PD-003). */
  number: z.string().nullable(),
  fiscalYear: z.string().nullable(),
  status: ComparisonStatus,
  company: IndentScopeSummary,
  project: IndentScopeSummary,
  site: IndentScopeSummary,
  enquiry: z.object({ id: z.uuid(), number: z.string() }),
  comparisonDate: z.string(),
  remarks: z.string().nullable(),
  lineCount: z.number().int(),
  selectedLineCount: z.number().int(),
  /** Sum of the chosen quotation lines' taxable amounts (GST excluded). */
  selectedValue: z.string(),
  finalisedAt: z.string().nullable(),
  finalisedBy: IndentActorSummary.nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: IndentActorSummary.nullable(),
  cancelRemarks: z.string().nullable(),
  createdBy: IndentActorSummary,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Draft, and the user may edit and finalise it. */
  canEdit: z.boolean(),
  /** Draft, enquiry still Sent, and the user may finalise it. */
  canFinalise: z.boolean(),
  /** Draft, and the user may cancel it. */
  canCancel: z.boolean(),
});

export type ComparisonResponse = z.infer<typeof ComparisonResponse>;

export const ComparisonDetailLine = ComparisonGridLine.extend({
  selectedVendorId: z.uuid().nullable(),
  reason: z.string().nullable(),
});

export type ComparisonDetailLine = z.infer<typeof ComparisonDetailLine>;

/** Draft: grid from the latest Submitted quotations. Finalised: grid from the quotations recorded at Finalise. */
export const ComparisonDetailResponse = ComparisonResponse.extend({
  vendors: z.array(ComparisonVendorColumn),
  lines: z.array(ComparisonDetailLine),
});

export type ComparisonDetailResponse = z.infer<typeof ComparisonDetailResponse>;

export const PagedComparisonsResponse = z.object({
  items: z.array(ComparisonResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedComparisonsResponse = z.infer<typeof PagedComparisonsResponse>;
