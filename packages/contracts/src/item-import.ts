import { z } from 'zod';

/** PD-042 limits. */
export const ITEM_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ITEM_IMPORT_MAX_ROWS = 2000;
/** Longest cell text carried in the grid; longer text is cut and then reported as too long. */
export const ITEM_IMPORT_CELL_MAX = 1000;
/** Same limits as ItemFields (description 300, size 200). */
export const ITEM_DESCRIPTION_MAX = 300;
export const ITEM_SIZE_MAX = 200;

export const ITEM_IMPORT_FILE_ERROR_CODES = [
  'IMPORT_FILE_REQUIRED',
  'IMPORT_FILE_INVALID',
  'IMPORT_HEADER_NOT_FOUND',
  'IMPORT_NO_ROWS',
  'IMPORT_TOO_MANY_ROWS',
] as const;

export type ItemImportFileErrorCode = (typeof ITEM_IMPORT_FILE_ERROR_CODES)[number];

export const ITEM_IMPORT_ISSUE_CODES = [
  'DESCRIPTION_REQUIRED',
  'DESCRIPTION_TOO_LONG',
  'SIZE_TOO_LONG',
  'UNIT_REQUIRED',
  'UNIT_NOT_MATCHED',
  'CATEGORY_REQUIRED',
  'CATEGORY_NOT_MATCHED',
  'INVALID_HSN',
  'INVALID_GST_RATE',
  'DUPLICATE_EXISTING',
  'DUPLICATE_IN_FILE',
  'SIMILAR_EXISTING',
  'SIMILAR_IN_FILE',
] as const;

export const ItemImportIssueCode = z.enum(ITEM_IMPORT_ISSUE_CODES);

export type ItemImportIssueCode = z.infer<typeof ItemImportIssueCode>;

/** Yellow: the row still imports as written (OQ-30, CQ-106). Every other code is red. */
export const ITEM_IMPORT_WARNING_CODES: readonly ItemImportIssueCode[] = [
  'SIMILAR_EXISTING',
  'SIMILAR_IN_FILE',
];

export const ItemImportIssue = z.object({
  code: ItemImportIssueCode,
  severity: z.enum(['error', 'warning']),
  /** Existing item code, for DUPLICATE_EXISTING and SIMILAR_EXISTING. */
  refCode: z.string().nullable(),
  /** Description of the existing item or of the other row. */
  refText: z.string().nullable(),
  /** Excel row number of the other row, for *_IN_FILE issues. */
  refRow: z.number().int().nullable(),
});

export type ItemImportIssue = z.infer<typeof ItemImportIssue>;

/** One grid row as the user sees and edits it. Texts are as in the file; ids are the picks. */
export const ItemImportRowInput = z.object({
  /** Excel row number, so messages and "same as row N" point at the file. */
  rowNumber: z.number().int().min(1),
  description: z.string().max(ITEM_IMPORT_CELL_MAX),
  size: z.string().max(ITEM_IMPORT_CELL_MAX),
  /** Unit spelling from the file; kept for "apply to all rows with this spelling". */
  unitText: z.string().max(ITEM_IMPORT_CELL_MAX),
  categoryText: z.string().max(ITEM_IMPORT_CELL_MAX),
  unitId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  hsnCode: z.string().max(ITEM_IMPORT_CELL_MAX),
  gstRate: z.string().max(ITEM_IMPORT_CELL_MAX),
});

export type ItemImportRowInput = z.infer<typeof ItemImportRowInput>;

export const ITEM_IMPORT_ROW_STATUSES = ['READY', 'WARNING', 'ERROR'] as const;

export const ItemImportRowStatus = z.enum(ITEM_IMPORT_ROW_STATUSES);

export type ItemImportRowStatus = z.infer<typeof ItemImportRowStatus>;

export const ItemImportRowResult = ItemImportRowInput.extend({
  status: ItemImportRowStatus,
  issues: z.array(ItemImportIssue),
});

export type ItemImportRowResult = z.infer<typeof ItemImportRowResult>;

/** A unit or category spelling that matched nothing, with how many rows use it. */
export const ItemImportUnmatched = z.object({ text: z.string(), rows: z.number().int() });

export type ItemImportUnmatched = z.infer<typeof ItemImportUnmatched>;

export const ItemImportSummary = z.object({
  total: z.number().int(),
  ready: z.number().int(),
  warning: z.number().int(),
  error: z.number().int(),
});

export type ItemImportSummary = z.infer<typeof ItemImportSummary>;

export const ItemImportCheckResponse = z.object({
  rows: z.array(ItemImportRowResult),
  summary: ItemImportSummary,
  unmatchedUnits: z.array(ItemImportUnmatched),
  unmatchedCategories: z.array(ItemImportUnmatched),
});

export type ItemImportCheckResponse = z.infer<typeof ItemImportCheckResponse>;

export const ItemImportPreviewResponse = ItemImportCheckResponse.extend({
  sheetName: z.string(),
  headerRowNumber: z.number().int(),
});

export type ItemImportPreviewResponse = z.infer<typeof ItemImportPreviewResponse>;

/** "Check again": the whole grid is sent back, because in-file duplicates need every row. */
export const ItemImportCheckRequest = z.object({
  rows: z
    .array(ItemImportRowInput)
    .min(1)
    .max(ITEM_IMPORT_MAX_ROWS)
    .refine((rows) => new Set(rows.map((row) => row.rowNumber)).size === rows.length, {
      message: 'Row numbers must be unique',
    }),
});

export type ItemImportCheckRequest = z.infer<typeof ItemImportCheckRequest>;
