import { z } from 'zod';
import { ApprovalRoleSummary } from './approval-workflows';
import { IndentActorSummary } from './indents';

/** Same values as the Prisma enum NotificationKind (G-12 migration). */
export const NOTIFICATION_KINDS = [
  'APPROVAL_PENDING',
  'APPROVAL_ON_HOLD',
  'APPROVER_NEEDED',
  'PURCHASE_ORDER_APPROVED',
  'PURCHASE_ORDER_REJECTED',
  'PURCHASE_ORDER_CANCELLED',
] as const;
export const NotificationKind = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** Bell list size (OQ-130). */
export const MAX_NOTIFICATIONS_LISTED = 30;

export const NotificationPurchaseOrderSummary = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  revisionNo: z.number().int(),
  vendorName: z.string(),
});
export type NotificationPurchaseOrderSummary = z.infer<typeof NotificationPurchaseOrderSummary>;

export const NotificationResponse = z.object({
  id: z.uuid(),
  kind: NotificationKind,
  createdAt: z.string(),
  readAt: z.string().nullable(),
  /** The level is still waiting for this user (Pending with them, or On hold for an admin) (OQ-130). */
  actionNeeded: z.boolean(),
  levelNo: z.number().int().nullable(),
  purchaseOrder: NotificationPurchaseOrderSummary.nullable(),
});
export type NotificationResponse = z.infer<typeof NotificationResponse>;

/** Action needed first, then unread, then read; newest first in each group (OQ-130). */
export const NotificationListResponse = z.object({
  items: z.array(NotificationResponse),
  unreadCount: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponse>;

export const UnreadNotificationCountResponse = z.object({ unreadCount: z.number().int() });
export type UnreadNotificationCountResponse = z.infer<typeof UnreadNotificationCountResponse>;

export const ApprovalInboxItem = z.object({
  purchaseOrder: z.object({
    id: z.uuid(),
    number: z.string().nullable(),
    revisionNo: z.number().int(),
    projectCode: z.string(),
    vendorName: z.string(),
    subtotal: z.string(),
    grandTotal: z.string(),
    submittedAt: z.string().nullable(),
    submittedBy: IndentActorSummary.nullable(),
  }),
  levelNo: z.number().int(),
  role: ApprovalRoleSummary,
  /** The Administrator routed this level to a higher role (OQ-119). */
  routed: z.boolean(),
  status: z.enum(['PENDING', 'ON_HOLD']),
  assignedAt: z.string().nullable(),
});
export type ApprovalInboxItem = z.infer<typeof ApprovalInboxItem>;

/** Home: levels waiting for me; onHold only for an Administrator (OQ-118), else null. Oldest first. */
export const ApprovalInboxResponse = z.object({
  awaitingMe: z.array(ApprovalInboxItem),
  onHold: z.array(ApprovalInboxItem).nullable(),
});
export type ApprovalInboxResponse = z.infer<typeof ApprovalInboxResponse>;
