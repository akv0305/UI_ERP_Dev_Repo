import { z } from 'zod';

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DEACTIVATE', 'REACTIVATE'] as const;

export const AuditAction = z.enum(AUDIT_ACTIONS);

export type AuditAction = z.infer<typeof AuditAction>;

/** Values stored in audit_events.entityType. */
export const AUDIT_ENTITY_TYPES = [
  'User',
  'Role',
  'Company',
  'CompanyGstRegistration',
  'Project',
  'Site',
  'Store',
  'Unit',
  'ItemCategory',
  'Item',
  'Vendor',
  'VendorGstRegistration',
  'VendorBankAccount',
  'VendorContact',
  'Indent',
  'Enquiry',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AuditEventListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entityType: z.string().trim().min(1).max(64).optional(),
  entityId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
});

export type AuditEventListQuery = z.infer<typeof AuditEventListQuery>;

export const AuditActor = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
});

export type AuditActor = z.infer<typeof AuditActor>;

export const AuditEventSummary = z.object({
  id: z.uuid(),
  occurredAt: z.string(),
  actor: AuditActor.nullable(),
  action: AuditAction,
  entityType: z.string(),
  entityId: z.uuid(),
  entityLabel: z.string(),
  companyId: z.uuid().nullable(),
});

export type AuditEventSummary = z.infer<typeof AuditEventSummary>;

export const AuditSnapshot = z.record(z.string(), z.unknown());

export type AuditSnapshot = z.infer<typeof AuditSnapshot>;

export const AuditEventDetail = AuditEventSummary.extend({
  requestId: z.string().nullable(),
  before: AuditSnapshot.nullable(),
  after: AuditSnapshot.nullable(),
});

export type AuditEventDetail = z.infer<typeof AuditEventDetail>;

export const PagedAuditEventsResponse = z.object({
  items: z.array(AuditEventSummary),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PagedAuditEventsResponse = z.infer<typeof PagedAuditEventsResponse>;
