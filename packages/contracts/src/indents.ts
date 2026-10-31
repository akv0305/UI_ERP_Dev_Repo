import { z } from 'zod';
import { ISO_DATE_PATTERN } from './masters';
import { OptionalText, optional } from './validators';

export const INDENT_ERROR_CODES = [
  'INVALID_STATUS',
  'SELF_APPROVAL_NOT_ALLOWED',
  'INVALID_PROJECT',
  'INVALID_SITE',
  'INVALID_STORE',
  'INVALID_ITEM',
  'DUPLICATE_LINE_ITEM',
  'INVALID_QUANTITY',
  'INVALID_APPROVED_QUANTITY',
  'INVALID_DATE',
] as const;

export type IndentErrorCode = (typeof INDENT_ERROR_CODES)[number];

/** Document types that take a number from document_series (PD-003). */
export const DOCUMENT_TYPES = [
  'INDENT',
  'ENQUIRY',
  'QUOTATION',
  'COMPARISON',
  'PURCHASE_ORDER',
] as const;

export const DocumentType = z.enum(DOCUMENT_TYPES);

export type DocumentType = z.infer<typeof DocumentType>;

export const INDENT_NUMBER_PREFIX = 'IND';
export const INDENT_NUMBER_DIGITS = 4;
export const MAX_INDENT_LINES = 200;

/** Quantity as a string with up to 3 decimals (numeric 18,3), so it never passes through a float. */
export const QUANTITY_PATTERN = /^\d{1,15}(\.\d{1,3})?$/;

export const QuantitySchema = z.coerce.string().trim().regex(QUANTITY_PATTERN);

export const PositiveQuantitySchema = QuantitySchema.refine((value) => Number(value) > 0);

const IsoDate = z.string().regex(ISO_DATE_PATTERN);

/** Indian financial year (April-March) of an ISO date: 2026-10-22 -> "2026-27", 2027-02-01 -> "2026-27". */
export function fiscalYearOf(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = month >= 4 ? year : year - 1;

  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** IND/TDV/2026-27/0001. Never truncates: 10000 stays 10000. */
export function formatDocumentNumber(
  prefix: string,
  scopeCode: string,
  fiscalYear: string,
  value: number,
  digits: number,
): string {
  return `${prefix}/${scopeCode}/${fiscalYear}/${String(value).padStart(digits, '0')}`;
}

export const INDENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export const IndentStatus = z.enum(INDENT_STATUSES);

export type IndentStatus = z.infer<typeof IndentStatus>;

// ---------- Requests ----------

export const IndentLineInput = z.object({
  itemId: z.uuid(),
  requiredQty: PositiveQuantitySchema,
  purpose: OptionalText(300),
  remarks: OptionalText(300),
});

export type IndentLineInput = z.infer<typeof IndentLineInput>;

/** One line per item; required-by date not before the indent date. */
function checkIndent(
  value: { indentDate: string; requiredByDate: string | null; lines: { itemId: string }[] },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();

  value.lines.forEach((line, index) => {
    if (seen.has(line.itemId)) {
      ctx.addIssue({ code: 'custom', path: ['lines', index, 'itemId'], message: 'Item repeated' });
    }

    seen.add(line.itemId);
  });

  if (value.requiredByDate !== null && value.requiredByDate < value.indentDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['requiredByDate'],
      message: 'Required-by date is before the indent date',
    });
  }
}

/** The number, status and company are set by the API and never sent. */
export const IndentFields = z.object({
  siteId: z.uuid(),
  storeId: optional(z.uuid()),
  indentDate: IsoDate,
  requiredByDate: optional(IsoDate),
  requestedBy: z.string().trim().min(1).max(120),
  remarks: OptionalText(500),
  lines: z.array(IndentLineInput).min(1).max(MAX_INDENT_LINES),
});

export const CreateIndentRequest = IndentFields.extend({ projectId: z.uuid() }).superRefine(
  checkIndent,
);

export type CreateIndentRequest = z.infer<typeof CreateIndentRequest>;

/** The project is fixed at creation; the whole line list is sent on every save. */
export const UpdateIndentRequest = IndentFields.superRefine(checkIndent);

export type UpdateIndentRequest = z.infer<typeof UpdateIndentRequest>;

/** Approved qty per line: 0 refuses the line; never above the required qty (OQ-40, checked by the API). */
export const ApproveIndentRequest = z.object({
  lines: z
    .array(z.object({ lineId: z.uuid(), approvedQty: QuantitySchema }))
    .min(1)
    .max(MAX_INDENT_LINES)
    .refine((lines) => new Set(lines.map((line) => line.lineId)).size === lines.length, {
      message: 'Line ids must be unique',
    }),
  remarks: OptionalText(500),
});

export type ApproveIndentRequest = z.infer<typeof ApproveIndentRequest>;

export const RejectIndentRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type RejectIndentRequest = z.infer<typeof RejectIndentRequest>;

export const CancelIndentRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type CancelIndentRequest = z.infer<typeof CancelIndentRequest>;

export const IndentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  projectId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  status: IndentStatus.optional(),
  fromDate: IsoDate.optional(),
  toDate: IsoDate.optional(),
  sortBy: z.enum(['number', 'indentDate', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type IndentListQuery = z.infer<typeof IndentListQuery>;

// ---------- Responses ----------

export const IndentActorSummary = z.object({ id: z.uuid(), displayName: z.string() });

export type IndentActorSummary = z.infer<typeof IndentActorSummary>;

export const IndentScopeSummary = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export type IndentScopeSummary = z.infer<typeof IndentScopeSummary>;

export const IndentLineResponse = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  item: z.object({
    id: z.uuid(),
    code: z.string(),
    description: z.string(),
    size: z.string().nullable(),
    unitCode: z.string(),
    decimalPlaces: z.number().int(),
  }),
  requiredQty: z.string(),
  approvedQty: z.string().nullable(),
  purpose: z.string().nullable(),
  remarks: z.string().nullable(),
});

export type IndentLineResponse = z.infer<typeof IndentLineResponse>;

export const IndentResponse = z.object({
  id: z.uuid(),
  /** Null while Draft (PD-003: drafts are unnumbered). */
  number: z.string().nullable(),
  fiscalYear: z.string().nullable(),
  status: IndentStatus,
  company: IndentScopeSummary,
  project: IndentScopeSummary,
  site: IndentScopeSummary,
  store: IndentScopeSummary.nullable(),
  indentDate: z.string(),
  requiredByDate: z.string().nullable(),
  requestedBy: z.string(),
  remarks: z.string().nullable(),
  lineCount: z.number().int(),
  submittedAt: z.string().nullable(),
  submittedBy: IndentActorSummary.nullable(),
  decidedAt: z.string().nullable(),
  decidedBy: IndentActorSummary.nullable(),
  decisionRemarks: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: IndentActorSummary.nullable(),
  cancelRemarks: z.string().nullable(),
  /** "Posted by" on the paper indent (OQ-42). */
  createdBy: IndentActorSummary,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Draft or Rejected, and the user may edit and submit it. */
  canEdit: z.boolean(),
  /** Pending, and the user may approve or reject it (not the submitter). */
  canApprove: z.boolean(),
  /** Draft or Rejected, and the user may cancel it. */
  canCancel: z.boolean(),
});

export type IndentResponse = z.infer<typeof IndentResponse>;

export const IndentDetailResponse = IndentResponse.extend({
  lines: z.array(IndentLineResponse),
});

export type IndentDetailResponse = z.infer<typeof IndentDetailResponse>;

export const PagedIndentsResponse = z.object({
  items: z.array(IndentResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedIndentsResponse = z.infer<typeof PagedIndentsResponse>;

// ---------- Option lists for the indent form ----------

/** Only the projects / sites / stores the user may raise indents for ("CODE  Name" labels). */
export const IndentFormOptionsResponse = z.object({
  projects: z.array(z.object({ id: z.uuid(), label: z.string(), companyId: z.uuid() })),
  sites: z.array(z.object({ id: z.uuid(), label: z.string(), projectId: z.uuid() })),
  stores: z.array(z.object({ id: z.uuid(), label: z.string(), siteId: z.uuid() })),
});

export type IndentFormOptionsResponse = z.infer<typeof IndentFormOptionsResponse>;

export const IndentItemOptionsQuery = z.object({
  search: z.string().trim().max(120).optional(),
});

export type IndentItemOptionsQuery = z.infer<typeof IndentItemOptionsQuery>;

/** Approved, active items for the line picker. */
export const IndentItemOptionsResponse = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      unitCode: z.string(),
      decimalPlaces: z.number().int(),
    }),
  ),
});

export type IndentItemOptionsResponse = z.infer<typeof IndentItemOptionsResponse>;
