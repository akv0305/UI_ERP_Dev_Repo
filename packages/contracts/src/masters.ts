import { z } from 'zod';
import {
  CinSchema,
  GstinInputSchema,
  LlpinSchema,
  MasterCodeSchema,
  OptionalText,
  PanSchema,
  PinCodeSchema,
  TanSchema,
  optional,
} from './validators';

export const MASTER_ERROR_CODES = [
  'DUPLICATE_CODE',
  'CODE_IMMUTABLE',
  'INVALID_GSTIN',
  'GSTIN_STATE_MISMATCH',
  'GSTIN_PAN_MISMATCH',
  'DUPLICATE_GSTIN',
  'INVALID_STATE',
  'INVALID_GST_REGISTRATION',
  'HAS_ACTIVE_CHILDREN',
  'PARENT_INACTIVE',
  'NOT_FOUND',
] as const;

export type MasterErrorCode = (typeof MASTER_ERROR_CODES)[number];

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const IsoDate = z.string().regex(ISO_DATE_PATTERN);

export const MasterListQueryBase = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

// ---------- States ----------

export const StateResponse = z.object({
  id: z.uuid(),
  gstCode: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

export type StateResponse = z.infer<typeof StateResponse>;

export const StateListResponse = z.object({ items: z.array(StateResponse) });

export type StateListResponse = z.infer<typeof StateListResponse>;

// ---------- Companies ----------

export const COMPANY_ENTITY_TYPES = ['COMPANY', 'SPV', 'JV'] as const;

export const CompanyEntityType = z.enum(COMPANY_ENTITY_TYPES);

export type CompanyEntityType = z.infer<typeof CompanyEntityType>;

export const CompanyFields = z.object({
  legalName: z.string().trim().min(1).max(200),
  entityType: CompanyEntityType,
  pan: optional(PanSchema),
  tan: optional(TanSchema),
  cin: optional(CinSchema),
  llpin: optional(LlpinSchema),
  addressLine1: OptionalText(200),
  addressLine2: OptionalText(200),
  city: OptionalText(100),
  stateId: optional(z.uuid()),
  pinCode: optional(PinCodeSchema),
});

export const CreateCompanyRequest = CompanyFields.extend({ code: MasterCodeSchema });

export type CreateCompanyRequest = z.infer<typeof CreateCompanyRequest>;

/** `code` may be sent, but only to repeat the current value: a different one is CODE_IMMUTABLE. */
export const UpdateCompanyRequest = CompanyFields.extend({ code: MasterCodeSchema.optional() });

export type UpdateCompanyRequest = z.infer<typeof UpdateCompanyRequest>;

export const CompanyListQuery = MasterListQueryBase.extend({
  entityType: CompanyEntityType.optional(),
  sortBy: z.enum(['code', 'legalName', 'entityType', 'createdAt']).default('code'),
});

export type CompanyListQuery = z.infer<typeof CompanyListQuery>;

export const GST_REGISTRATION_TYPES = [
  'REGULAR',
  'COMPOSITION',
  'SEZ_UNIT',
  'CASUAL',
  'ISD',
] as const;

export const GstRegistrationType = z.enum(GST_REGISTRATION_TYPES);

export type GstRegistrationType = z.infer<typeof GstRegistrationType>;

export const GstRegistrationFields = z.object({
  stateId: z.uuid(),
  gstin: GstinInputSchema,
  registrationType: GstRegistrationType,
  effectiveFrom: optional(IsoDate),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: OptionalText(200),
  city: z.string().trim().min(1).max(100),
  pinCode: PinCodeSchema,
});

export const CreateGstRegistrationRequest = GstRegistrationFields;

export type CreateGstRegistrationRequest = z.infer<typeof CreateGstRegistrationRequest>;

export const UpdateGstRegistrationRequest = GstRegistrationFields;

export type UpdateGstRegistrationRequest = z.infer<typeof UpdateGstRegistrationRequest>;

export const GstRegistrationResponse = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  state: StateResponse,
  gstin: z.string(),
  registrationType: GstRegistrationType,
  effectiveFrom: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  pinCode: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GstRegistrationResponse = z.infer<typeof GstRegistrationResponse>;

export const CompanyResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  legalName: z.string(),
  entityType: CompanyEntityType,
  pan: z.string().nullable(),
  tan: z.string().nullable(),
  cin: z.string().nullable(),
  llpin: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: StateResponse.nullable(),
  pinCode: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** True when the signed-in user may edit, deactivate or reactivate this record. */
  canManage: z.boolean(),
});

export type CompanyResponse = z.infer<typeof CompanyResponse>;

export const CompanyDetailResponse = CompanyResponse.extend({
  gstRegistrations: z.array(GstRegistrationResponse),
});

export type CompanyDetailResponse = z.infer<typeof CompanyDetailResponse>;

export const PagedCompaniesResponse = z.object({
  items: z.array(CompanyResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedCompaniesResponse = z.infer<typeof PagedCompaniesResponse>;
