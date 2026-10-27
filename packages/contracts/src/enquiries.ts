import { z } from 'zod';
import { IndentActorSummary, IndentScopeSummary, PositiveQuantitySchema } from './indents';
import { ISO_DATE_PATTERN } from './masters';
import { OptionalText } from './validators';

export const ENQUIRY_ERROR_CODES = [
  'INVALID_STATUS',
  'INVALID_PROJECT',
  'INVALID_SITE',
  'INVALID_INDENT_LINE',
  'DUPLICATE_INDENT_LINE',
  'INVALID_QUANTITY',
  'INVALID_VENDOR',
  'DUPLICATE_VENDOR',
  'INVALID_DATE',
] as const;

export type EnquiryErrorCode = (typeof ENQUIRY_ERROR_CODES)[number];

export const ENQUIRY_NUMBER_PREFIX = 'ENQ';
export const ENQUIRY_NUMBER_DIGITS = 4;
export const MAX_ENQUIRY_LINES = 200;
export const MAX_ENQUIRY_VENDORS = 20;

export const ENQUIRY_STATUSES = ['DRAFT', 'SENT', 'CLOSED', 'CANCELLED'] as const;

export const EnquiryStatus = z.enum(ENQUIRY_STATUSES);

export type EnquiryStatus = z.infer<typeof EnquiryStatus>;

const IsoDate = z.string().regex(ISO_DATE_PATTERN);

// ---------- Requests ----------

/** quantity > 0 here; never above the indent line's approved qty (OQ-47, checked by the API). */
export const EnquiryLineInput = z.object({
  indentLineId: z.uuid(),
  quantity: PositiveQuantitySchema,
  remarks: OptionalText(300),
});

export type EnquiryLineInput = z.infer<typeof EnquiryLineInput>;

/** One line per indent line, one entry per vendor, quote due date not before the enquiry date. */
function checkEnquiry(
  value: {
    enquiryDate: string;
    quoteDueDate: string;
    lines: { indentLineId: string }[];
    vendorIds: string[];
  },
  ctx: z.RefinementCtx,
): void {
  const seenLines = new Set<string>();

  value.lines.forEach((line, index) => {
    if (seenLines.has(line.indentLineId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', index, 'indentLineId'],
        message: 'Indent line repeated',
      });
    }

    seenLines.add(line.indentLineId);
  });

  const seenVendors = new Set<string>();

  value.vendorIds.forEach((vendorId, index) => {
    if (seenVendors.has(vendorId)) {
      ctx.addIssue({ code: 'custom', path: ['vendorIds', index], message: 'Vendor repeated' });
    }

    seenVendors.add(vendorId);
  });

  if (value.quoteDueDate < value.enquiryDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['quoteDueDate'],
      message: 'Quote due date is before the enquiry date',
    });
  }
}

/** Number, status and company are set by the API. siteId = delivery location (OQ-51). */
export const EnquiryFields = z.object({
  siteId: z.uuid(),
  enquiryDate: IsoDate,
  quoteDueDate: IsoDate,
  terms: OptionalText(2000),
  remarks: OptionalText(500),
  lines: z.array(EnquiryLineInput).min(1).max(MAX_ENQUIRY_LINES),
  vendorIds: z.array(z.uuid()).min(1).max(MAX_ENQUIRY_VENDORS),
});

export const CreateEnquiryRequest = EnquiryFields.extend({ projectId: z.uuid() }).superRefine(
  checkEnquiry,
);

export type CreateEnquiryRequest = z.infer<typeof CreateEnquiryRequest>;

/** Project fixed at creation; whole line and vendor lists sent on every save. */
export const UpdateEnquiryRequest = EnquiryFields.superRefine(checkEnquiry);

export type UpdateEnquiryRequest = z.infer<typeof UpdateEnquiryRequest>;

export const CancelEnquiryRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type CancelEnquiryRequest = z.infer<typeof CancelEnquiryRequest>;

export const EnquiryListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  projectId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  status: EnquiryStatus.optional(),
  fromDate: IsoDate.optional(),
  toDate: IsoDate.optional(),
  sortBy: z.enum(['number', 'enquiryDate', 'quoteDueDate', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type EnquiryListQuery = z.infer<typeof EnquiryListQuery>;

// ---------- Responses ----------

export const EnquiryItemSummary = z.object({
  id: z.uuid(),
  code: z.string(),
  description: z.string(),
  size: z.string().nullable(),
  unitCode: z.string(),
  decimalPlaces: z.number().int(),
});

export type EnquiryItemSummary = z.infer<typeof EnquiryItemSummary>;

export const EnquiryLineResponse = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  indentLine: z.object({
    id: z.uuid(),
    indentId: z.uuid(),
    indentNumber: z.string(),
    lineNo: z.number().int(),
    approvedQty: z.string(),
  }),
  item: EnquiryItemSummary,
  quantity: z.string(),
  remarks: z.string().nullable(),
});

export type EnquiryLineResponse = z.infer<typeof EnquiryLineResponse>;

export const EnquiryVendorResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  legalName: z.string(),
});

export type EnquiryVendorResponse = z.infer<typeof EnquiryVendorResponse>;

export const EnquiryResponse = z.object({
  id: z.uuid(),
  /** Null while Draft (PD-003). */
  number: z.string().nullable(),
  fiscalYear: z.string().nullable(),
  status: EnquiryStatus,
  company: IndentScopeSummary,
  project: IndentScopeSummary,
  site: IndentScopeSummary,
  enquiryDate: z.string(),
  quoteDueDate: z.string(),
  terms: z.string().nullable(),
  remarks: z.string().nullable(),
  lineCount: z.number().int(),
  vendorCount: z.number().int(),
  sentAt: z.string().nullable(),
  sentBy: IndentActorSummary.nullable(),
  closedAt: z.string().nullable(),
  closedBy: IndentActorSummary.nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: IndentActorSummary.nullable(),
  cancelRemarks: z.string().nullable(),
  createdBy: IndentActorSummary,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Draft, and the user may edit and send it. */
  canEdit: z.boolean(),
  /** Sent, and the user may close it. */
  canClose: z.boolean(),
  /** Draft or Sent, and the user may cancel it. */
  canCancel: z.boolean(),
});

export type EnquiryResponse = z.infer<typeof EnquiryResponse>;

export const EnquiryDetailResponse = EnquiryResponse.extend({
  lines: z.array(EnquiryLineResponse),
  vendors: z.array(EnquiryVendorResponse),
});

export type EnquiryDetailResponse = z.infer<typeof EnquiryDetailResponse>;

export const PagedEnquiriesResponse = z.object({
  items: z.array(EnquiryResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedEnquiriesResponse = z.infer<typeof PagedEnquiriesResponse>;

// ---------- Option lists for the enquiry form ----------

/** Projects / sites where the user holds purchase.enquiries.manage ("CODE  Name" labels). */
export const EnquiryFormOptionsResponse = z.object({
  projects: z.array(z.object({ id: z.uuid(), label: z.string(), companyId: z.uuid() })),
  sites: z.array(z.object({ id: z.uuid(), label: z.string(), projectId: z.uuid() })),
});

export type EnquiryFormOptionsResponse = z.infer<typeof EnquiryFormOptionsResponse>;

export const EnquiryIndentLineOptionsQuery = z.object({
  siteId: z.uuid(),
  search: z.string().trim().max(120).optional(),
});

export type EnquiryIndentLineOptionsQuery = z.infer<typeof EnquiryIndentLineOptionsQuery>;

/** Lines of Approved indents of the site with approved qty > 0; enquiryCount shows re-enquiries (OQ-46). */
export const EnquiryIndentLineOptionsResponse = z.object({
  lines: z.array(
    z.object({
      indentLineId: z.uuid(),
      indentId: z.uuid(),
      indentNumber: z.string(),
      indentDate: z.string(),
      lineNo: z.number().int(),
      item: EnquiryItemSummary,
      approvedQty: z.string(),
      enquiryCount: z.number().int(),
    }),
  ),
});

export type EnquiryIndentLineOptionsResponse = z.infer<typeof EnquiryIndentLineOptionsResponse>;

export const EnquiryVendorOptionsQuery = z.object({
  search: z.string().trim().max(120).optional(),
});

export type EnquiryVendorOptionsQuery = z.infer<typeof EnquiryVendorOptionsQuery>;

/** Approved, active vendors. */
export const EnquiryVendorOptionsResponse = z.object({
  vendors: z.array(z.object({ id: z.uuid(), label: z.string() })),
});

export type EnquiryVendorOptionsResponse = z.infer<typeof EnquiryVendorOptionsResponse>;
// ---------- One vendor's printed copy (OQ-52 A) ----------

export const EnquiryPrintQuery = z.object({ vendorId: z.uuid() });

export type EnquiryPrintQuery = z.infer<typeof EnquiryPrintQuery>;

/** state = "36 Telangana" (GST code + name). */
export const EnquiryPrintAddress = z.object({
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pinCode: z.string().nullable(),
});

export type EnquiryPrintAddress = z.infer<typeof EnquiryPrintAddress>;

/** Sent or Closed enquiries only. Indent references are internal and not printed. */
export const EnquiryPrintResponse = z.object({
  id: z.uuid(),
  number: z.string(),
  status: EnquiryStatus,
  enquiryDate: z.string(),
  quoteDueDate: z.string(),
  terms: z.string().nullable(),
  company: z.object({
    code: z.string(),
    legalName: z.string(),
    pan: z.string().nullable(),
    /** The project's billing GST registration, if set. */
    gstin: z.string().nullable(),
    address: EnquiryPrintAddress,
  }),
  project: IndentScopeSummary,
  site: z.object({
    code: z.string(),
    name: z.string(),
    address: EnquiryPrintAddress,
    contactPerson: z.string().nullable(),
    contactPhone: z.string().nullable(),
  }),
  vendor: z.object({
    id: z.uuid(),
    code: z.string(),
    legalName: z.string(),
    /** Registration in the site's state if any, else the first active one. */
    gstin: z.string().nullable(),
    address: EnquiryPrintAddress,
    contactName: z.string().nullable(),
    contactPhone: z.string().nullable(),
    contactEmail: z.string().nullable(),
  }),
  lines: z.array(
    z.object({
      lineNo: z.number().int(),
      item: EnquiryItemSummary,
      quantity: z.string(),
      remarks: z.string().nullable(),
    }),
  ),
});

export type EnquiryPrintResponse = z.infer<typeof EnquiryPrintResponse>;
