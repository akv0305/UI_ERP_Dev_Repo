import { z } from 'zod';
import { MasterListQueryBase, StateResponse } from './masters';
import { MasterCodeSchema, OptionalText, PhoneSchema, PinCodeSchema, optional } from './validators';

// ---------- Projects ----------

export const ProjectFields = z.object({
  name: z.string().trim().min(1).max(200),
  stateId: optional(z.uuid()),
  billingGstRegistrationId: optional(z.uuid()),
});

export const CreateProjectRequest = ProjectFields.extend({
  code: MasterCodeSchema,
  companyId: z.uuid(),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

/** `code` may be repeated unchanged; a different one is CODE_IMMUTABLE. The company is fixed at creation. */
export const UpdateProjectRequest = ProjectFields.extend({ code: MasterCodeSchema.optional() });

export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequest>;

export const ProjectListQuery = MasterListQueryBase.extend({
  companyId: z.uuid().optional(),
  sortBy: z.enum(['code', 'name', 'createdAt']).default('code'),
});

export type ProjectListQuery = z.infer<typeof ProjectListQuery>;

export const CompanySummary = z.object({
  id: z.uuid(),
  code: z.string(),
  legalName: z.string(),
  isActive: z.boolean(),
});

export type CompanySummary = z.infer<typeof CompanySummary>;

export const BillingGstSummary = z.object({
  id: z.uuid(),
  gstin: z.string(),
  isActive: z.boolean(),
});

export type BillingGstSummary = z.infer<typeof BillingGstSummary>;

export const ProjectResponse = z.object({
  id: z.uuid(),
  company: CompanySummary,
  code: z.string(),
  name: z.string(),
  state: StateResponse.nullable(),
  billingGstRegistration: BillingGstSummary.nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectResponse = z.infer<typeof ProjectResponse>;

export const PagedProjectsResponse = z.object({
  items: z.array(ProjectResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedProjectsResponse = z.infer<typeof PagedProjectsResponse>;

// ---------- Sites ----------

export const SiteFields = z.object({
  name: z.string().trim().min(1).max(200),
  addressLine1: OptionalText(200),
  addressLine2: OptionalText(200),
  city: OptionalText(100),
  stateId: optional(z.uuid()),
  pinCode: optional(PinCodeSchema),
  contactPerson: OptionalText(120),
  contactPhone: optional(PhoneSchema),
});

export const CreateSiteRequest = SiteFields.extend({
  code: MasterCodeSchema,
  projectId: z.uuid(),
});

export type CreateSiteRequest = z.infer<typeof CreateSiteRequest>;

/** `code` may be repeated unchanged; a different one is CODE_IMMUTABLE. The project is fixed at creation. */
export const UpdateSiteRequest = SiteFields.extend({ code: MasterCodeSchema.optional() });

export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequest>;

export const SiteListQuery = MasterListQueryBase.extend({
  projectId: z.uuid().optional(),
  sortBy: z.enum(['code', 'name', 'createdAt']).default('code'),
});

export type SiteListQuery = z.infer<typeof SiteListQuery>;

export const ProjectSummary = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  company: CompanySummary,
});

export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const SiteResponse = z.object({
  id: z.uuid(),
  project: ProjectSummary,
  code: z.string(),
  name: z.string(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: StateResponse.nullable(),
  pinCode: z.string().nullable(),
  contactPerson: z.string().nullable(),
  contactPhone: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SiteResponse = z.infer<typeof SiteResponse>;

export const PagedSitesResponse = z.object({
  items: z.array(SiteResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedSitesResponse = z.infer<typeof PagedSitesResponse>;

// ---------- Stores ----------

export const StoreFields = z.object({
  name: z.string().trim().min(1).max(200),
});

export const CreateStoreRequest = StoreFields.extend({ code: MasterCodeSchema });

export type CreateStoreRequest = z.infer<typeof CreateStoreRequest>;

/** `code` may be repeated unchanged; a different one is CODE_IMMUTABLE. */
export const UpdateStoreRequest = StoreFields.extend({ code: MasterCodeSchema.optional() });

export type UpdateStoreRequest = z.infer<typeof UpdateStoreRequest>;

export const StoreResponse = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StoreResponse = z.infer<typeof StoreResponse>;

export const StoreListResponse = z.object({ items: z.array(StoreResponse) });

export type StoreListResponse = z.infer<typeof StoreListResponse>;
