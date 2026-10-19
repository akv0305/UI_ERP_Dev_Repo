import { z } from 'zod';
import {
  GstRegistrationFields,
  GstRegistrationResponse,
  MasterListQueryBase,
  StateResponse,
} from './masters';
import {
  BankAccountNumberSchema,
  IfscSchema,
  OptionalText,
  PanSchema,
  PhoneSchema,
  PinCodeSchema,
  UdyamSchema,
  optional,
} from './validators';

/** GST errors (INVALID_GSTIN, GSTIN_STATE_MISMATCH, ...) come from MASTER_ERROR_CODES. */
export const VENDOR_ERROR_CODES = [
  'DUPLICATE_PAN',
  'DUPLICATE_UDYAM',
  'DUPLICATE_BANK_ACCOUNT',
  'INVALID_STATUS',
  'SELF_APPROVAL_NOT_ALLOWED',
] as const;

export type VendorErrorCode = (typeof VENDOR_ERROR_CODES)[number];

export const VENDOR_CODE_PREFIX = 'VEN-';
export const VENDOR_CODE_DIGITS = 4;
export const MAX_PAYMENT_TERMS_DAYS = 365;

/** Rupee amount as a string with up to 2 decimals, so it never passes through a float. */
export const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export const AmountSchema = z.coerce.string().trim().regex(AMOUNT_PATTERN);

export const VENDOR_TYPES = [
  'SUPPLIER',
  'SUBCONTRACTOR',
  'SERVICE_PROVIDER',
  'TRANSPORTER',
] as const;

export const VendorType = z.enum(VENDOR_TYPES);

export type VendorType = z.infer<typeof VendorType>;

export const MSME_CATEGORIES = ['MICRO', 'SMALL', 'MEDIUM'] as const;

export const MsmeCategory = z.enum(MSME_CATEGORIES);

export type MsmeCategory = z.infer<typeof MsmeCategory>;

export const VENDOR_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

export const VendorStatus = z.enum(VENDOR_STATUSES);

export type VendorStatus = z.infer<typeof VendorStatus>;

// ---------- Vendor ----------

/** The code (VEN-0001) and the status are set by the API and never sent. */
export const VendorFields = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradeName: OptionalText(200),
  vendorType: VendorType,
  pan: optional(PanSchema),
  udyamNumber: optional(UdyamSchema),
  msmeCategory: optional(MsmeCategory),
  addressLine1: OptionalText(200),
  addressLine2: OptionalText(200),
  city: OptionalText(100),
  stateId: optional(z.uuid()),
  pinCode: optional(PinCodeSchema),
  paymentTermsDays: optional(z.coerce.number().int().min(0).max(MAX_PAYMENT_TERMS_DAYS)),
  creditLimit: optional(AmountSchema),
  remarks: OptionalText(500),
});

/** Udyam number and MSME category are entered together or not at all (CHECK in the migration too). */
const msmePair = (value: z.infer<typeof VendorFields>, ctx: z.RefinementCtx): void => {
  if ((value.udyamNumber === null) !== (value.msmeCategory === null)) {
    ctx.addIssue({
      code: 'custom',
      path: [value.udyamNumber === null ? 'udyamNumber' : 'msmeCategory'],
      message: 'Udyam number and MSME category go together',
    });
  }
};

export const CreateVendorRequest = VendorFields.superRefine(msmePair);

export type CreateVendorRequest = z.infer<typeof CreateVendorRequest>;

export const UpdateVendorRequest = VendorFields.superRefine(msmePair);

export type UpdateVendorRequest = z.infer<typeof UpdateVendorRequest>;

export const ApproveVendorRequest = z.object({ remarks: OptionalText(500) });

export type ApproveVendorRequest = z.infer<typeof ApproveVendorRequest>;

export const RejectVendorRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type RejectVendorRequest = z.infer<typeof RejectVendorRequest>;

export const ReopenVendorRequest = z.object({ remarks: z.string().trim().min(1).max(500) });

export type ReopenVendorRequest = z.infer<typeof ReopenVendorRequest>;

export const VendorListQuery = MasterListQueryBase.extend({
  vendorType: VendorType.optional(),
  status: VendorStatus.optional(),
  stateId: z.uuid().optional(),
  sortBy: z.enum(['code', 'legalName', 'createdAt']).default('code'),
});

export type VendorListQuery = z.infer<typeof VendorListQuery>;

// ---------- GST registrations (same fields and checks as a company's) ----------

export const CreateVendorGstRegistrationRequest = GstRegistrationFields;

export type CreateVendorGstRegistrationRequest = z.infer<typeof CreateVendorGstRegistrationRequest>;

export const UpdateVendorGstRegistrationRequest = GstRegistrationFields;

export type UpdateVendorGstRegistrationRequest = z.infer<typeof UpdateVendorGstRegistrationRequest>;

export const VendorGstRegistrationResponse = GstRegistrationResponse.omit({
  companyId: true,
}).extend({
  vendorId: z.uuid(),
});

export type VendorGstRegistrationResponse = z.infer<typeof VendorGstRegistrationResponse>;

// ---------- Bank accounts ----------

export const VendorBankAccountFields = z.object({
  accountName: z.string().trim().min(1).max(200),
  accountNumber: BankAccountNumberSchema,
  ifsc: IfscSchema,
  bankName: z.string().trim().min(1).max(120),
  branchName: OptionalText(120),
  isPrimary: z.boolean().default(false),
});

export const CreateVendorBankAccountRequest = VendorBankAccountFields;

export type CreateVendorBankAccountRequest = z.infer<typeof CreateVendorBankAccountRequest>;

export const UpdateVendorBankAccountRequest = VendorBankAccountFields;

export type UpdateVendorBankAccountRequest = z.infer<typeof UpdateVendorBankAccountRequest>;

export const VendorBankAccountResponse = z.object({
  id: z.uuid(),
  vendorId: z.uuid(),
  accountName: z.string(),
  /** Masked (XXXXXX1234) unless the user holds masters.vendors.manage (OQ-35 d). */
  accountNumber: z.string(),
  ifsc: z.string(),
  bankName: z.string(),
  branchName: z.string().nullable(),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VendorBankAccountResponse = z.infer<typeof VendorBankAccountResponse>;

// ---------- Contacts ----------

export const VendorContactFields = z.object({
  name: z.string().trim().min(1).max(120),
  designation: OptionalText(100),
  phone: optional(PhoneSchema),
  email: optional(z.string().trim().pipe(z.email().max(254))),
  isPrimary: z.boolean().default(false),
});

export const CreateVendorContactRequest = VendorContactFields;

export type CreateVendorContactRequest = z.infer<typeof CreateVendorContactRequest>;

export const UpdateVendorContactRequest = VendorContactFields;

export type UpdateVendorContactRequest = z.infer<typeof UpdateVendorContactRequest>;

export const VendorContactResponse = z.object({
  id: z.uuid(),
  vendorId: z.uuid(),
  name: z.string(),
  designation: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VendorContactResponse = z.infer<typeof VendorContactResponse>;

// ---------- Responses ----------

export const VendorActorSummary = z.object({ id: z.uuid(), displayName: z.string() });

export const VendorResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  vendorType: VendorType,
  pan: z.string().nullable(),
  udyamNumber: z.string().nullable(),
  msmeCategory: MsmeCategory.nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: StateResponse.nullable(),
  pinCode: z.string().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  creditLimit: z.string().nullable(),
  remarks: z.string().nullable(),
  status: VendorStatus,
  submittedAt: z.string().nullable(),
  submittedBy: VendorActorSummary.nullable(),
  decidedAt: z.string().nullable(),
  decidedBy: VendorActorSummary.nullable(),
  decisionRemarks: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Draft or Rejected, active, and the user may edit and submit it. */
  canEdit: z.boolean(),
  /** The user may deactivate/reactivate, and edit contacts at any status. */
  canManage: z.boolean(),
  /** Pending, and the user may approve or reject it (not the submitter, OQ-35 b). */
  canApprove: z.boolean(),
  /** Approved, and the user may reopen it for editing. */
  canReopen: z.boolean(),
});

export type VendorResponse = z.infer<typeof VendorResponse>;

export const VendorDetailResponse = VendorResponse.extend({
  gstRegistrations: z.array(VendorGstRegistrationResponse),
  bankAccounts: z.array(VendorBankAccountResponse),
  contacts: z.array(VendorContactResponse),
});

export type VendorDetailResponse = z.infer<typeof VendorDetailResponse>;

export const PagedVendorsResponse = z.object({
  items: z.array(VendorResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedVendorsResponse = z.infer<typeof PagedVendorsResponse>;
