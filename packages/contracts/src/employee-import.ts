import { z } from 'zod';
import { ITEM_IMPORT_FILE_ERROR_CODES } from './item-import';

/** PD-042 limits, reused for employees (OQ-160). */
export const EMPLOYEE_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const EMPLOYEE_IMPORT_MAX_ROWS = 2000;
/** Header is searched in the first rows of the sheet (OQ-160). */
export const EMPLOYEE_IMPORT_HEADER_SEARCH_ROWS = 10;
/** Longest cell text carried in the grid; longer text is reported as too long. */
export const EMPLOYEE_IMPORT_CELL_MAX = 1000;
/** OQ-143 (c) code max 40, (d) full name max 120. */
export const EMPLOYEE_IMPORT_CODE_MAX = 40;
export const EMPLOYEE_IMPORT_FULL_NAME_MAX = 120;

/** File-level errors: same codes as the item import. */
export const EMPLOYEE_IMPORT_FILE_ERROR_CODES = ITEM_IMPORT_FILE_ERROR_CODES;

export type EmployeeImportFileErrorCode = (typeof EMPLOYEE_IMPORT_FILE_ERROR_CODES)[number];

export const EMPLOYEE_IMPORT_ISSUE_CODES = [
  'CODE_REQUIRED',
  'CODE_INVALID',
  'CODE_TOO_LONG',
  'DUPLICATE_EXISTING',
  'DUPLICATE_IN_FILE',
  'FULL_NAME_REQUIRED',
  'FULL_NAME_TOO_LONG',
  'DESIGNATION_NOT_MATCHED',
  'DATE_OF_JOINING_INVALID',
  'DATE_OF_JOINING_IN_FUTURE',
  'EMAIL_INVALID',
  'EMAIL_NO_COMPANY_DOMAIN',
  'EMAIL_DOMAIN_MISMATCH',
  'EMAIL_DUPLICATE_EXISTING',
  'EMAIL_DUPLICATE_IN_FILE',
  'USERNAME_TAKEN',
  'USER_EMAIL_TAKEN',
] as const;

export const EmployeeImportIssueCode = z.enum(EMPLOYEE_IMPORT_ISSUE_CODES);

export type EmployeeImportIssueCode = z.infer<typeof EmployeeImportIssueCode>;

/** Yellow: the row still imports (OQ-156, OQ-157). Every other code is red. */
export const EMPLOYEE_IMPORT_WARNING_CODES: readonly EmployeeImportIssueCode[] = [
  'DESIGNATION_NOT_MATCHED',
  'DATE_OF_JOINING_IN_FUTURE',
];

export const EmployeeImportIssue = z.object({
  code: EmployeeImportIssueCode,
  severity: z.enum(['error', 'warning']),
  /** Existing employee code or username, for *_EXISTING / *_TAKEN issues. */
  refCode: z.string().nullable(),
  /** Name of the existing employee or of the other row. */
  refText: z.string().nullable(),
  /** Excel row number of the other row, for *_IN_FILE issues. */
  refRow: z.number().int().nullable(),
});

export type EmployeeImportIssue = z.infer<typeof EmployeeImportIssue>;

/** One grid row. S. No is ignored (OQ-151); no work location columns (OQ-154). */
export const EmployeeImportRowInput = z.object({
  rowNumber: z.number().int().min(1),
  /** EMP CODE */
  code: z.string().max(EMPLOYEE_IMPORT_CELL_MAX),
  /** Name of the Employee */
  fullName: z.string().max(EMPLOYEE_IMPORT_CELL_MAX),
  /** Designation spelling from the file; kept for "apply to all rows with this spelling". */
  designationText: z.string().max(EMPLOYEE_IMPORT_CELL_MAX),
  designationId: z.uuid().nullable(),
  /** DOJ as DD-MM-YYYY (Excel date cells are converted at preview); blank = none. */
  dateOfJoining: z.string().max(EMPLOYEE_IMPORT_CELL_MAX),
  /** Email IDs */
  officialEmail: z.string().max(EMPLOYEE_IMPORT_CELL_MAX),
});

export type EmployeeImportRowInput = z.infer<typeof EmployeeImportRowInput>;

export const EMPLOYEE_IMPORT_ROW_STATUSES = ['READY', 'WARNING', 'ERROR'] as const;

export const EmployeeImportRowStatus = z.enum(EMPLOYEE_IMPORT_ROW_STATUSES);

export type EmployeeImportRowStatus = z.infer<typeof EmployeeImportRowStatus>;

export const EmployeeImportRowResult = EmployeeImportRowInput.extend({
  status: EmployeeImportRowStatus,
  issues: z.array(EmployeeImportIssue),
});

export type EmployeeImportRowResult = z.infer<typeof EmployeeImportRowResult>;

export const EmployeeImportUnmatched = z.object({ text: z.string(), rows: z.number().int() });

export type EmployeeImportUnmatched = z.infer<typeof EmployeeImportUnmatched>;

export const EmployeeImportSummary = z.object({
  total: z.number().int(),
  ready: z.number().int(),
  warning: z.number().int(),
  error: z.number().int(),
});

export type EmployeeImportSummary = z.infer<typeof EmployeeImportSummary>;

export const EmployeeImportCheckResponse = z.object({
  rows: z.array(EmployeeImportRowResult),
  summary: EmployeeImportSummary,
  unmatchedDesignations: z.array(EmployeeImportUnmatched),
});

export type EmployeeImportCheckResponse = z.infer<typeof EmployeeImportCheckResponse>;

export const EmployeeImportPreviewResponse = EmployeeImportCheckResponse.extend({
  sheetName: z.string(),
  headerRowNumber: z.number().int(),
});

export type EmployeeImportPreviewResponse = z.infer<typeof EmployeeImportPreviewResponse>;

const uniqueRowNumbers = (rows: { rowNumber: number }[]) =>
  new Set(rows.map((row) => row.rowNumber)).size === rows.length;

/** "Check again": whole grid, because in-file duplicates need every row. */
export const EmployeeImportCheckRequest = z.object({
  /** OQ-154 (a): every row goes to this company. */
  companyId: z.uuid(),
  /** OQ-159: username / user email clashes are red only when ticked. */
  createUsers: z.boolean().default(false),
  rows: z
    .array(EmployeeImportRowInput)
    .min(1)
    .max(EMPLOYEE_IMPORT_MAX_ROWS)
    .refine(uniqueRowNumbers, { message: 'Row numbers must be unique' }),
});

export type EmployeeImportCheckRequest = z.infer<typeof EmployeeImportCheckRequest>;

/** Commit: the grid plus the common temporary password (OQ-137). Policy is checked by the API (PD-029). */
export const EmployeeImportCommitRequest = EmployeeImportCheckRequest.extend({
  temporaryPassword: z.string().optional(),
}).refine((value) => !value.createUsers || (value.temporaryPassword ?? '').length > 0, {
  message: 'Temporary password is required when creating users',
  path: ['temporaryPassword'],
});

export type EmployeeImportCommitRequest = z.infer<typeof EmployeeImportCommitRequest>;

export const EmployeeImportCommitRow = z.object({
  rowNumber: z.number().int(),
  /** System Employee No., or null when the row was skipped. */
  employeeNo: z.string().nullable(),
  code: z.string().nullable(),
  userCreated: z.boolean(),
  issues: z.array(EmployeeImportIssue),
});

export type EmployeeImportCommitRow = z.infer<typeof EmployeeImportCommitRow>;

export const EmployeeImportCommitResponse = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  usersCreated: z.number().int(),
  firstEmployeeNo: z.string().nullable(),
  lastEmployeeNo: z.string().nullable(),
  rows: z.array(EmployeeImportCommitRow),
});

export type EmployeeImportCommitResponse = z.infer<typeof EmployeeImportCommitResponse>;
