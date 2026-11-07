import type { Permission, PurchaseOrderStatus } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { indentTargetOf, type IndentTarget } from '../indents/indent-rules';

export const PURCHASE_ORDER_VIEW: Permission = 'purchase.purchaseOrders.view';
export const PURCHASE_ORDER_MANAGE: Permission = 'purchase.purchaseOrders.manage';

/** Draft, or Rejected for correction and resubmit (OQ-111). */
export const EDITABLE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'REJECTED',
];

/** Until final approval; never once Approved (OQ-111, OQ-112). */
export const CANCELLABLE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'REJECTED',
];

/** Waiting for approval (PD-054). */
export const AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  'SUBMITTED',
];

/** Every status except Cancelled holds the one live PO per comparison + vendor (OQ-83, DB index). */
export const LIVE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
];

/** Checked against the PO's site, like indents. */
export function purchaseOrderTargetOf(purchaseOrder: {
  companyId: string;
  projectId: string;
  siteId: string;
}): IndentTarget {
  return indentTargetOf(purchaseOrder);
}

/** Visible with view or manage over the PO's site. */
export function canSeePurchaseOrder(access: AccessContext, target: IndentTarget): boolean {
  return access.canOn(PURCHASE_ORDER_VIEW, target) || access.canOn(PURCHASE_ORDER_MANAGE, target);
}

export interface PurchaseOrderFlags {
  canEdit: boolean;
  canCancel: boolean;
}

export function purchaseOrderFlagsFor(
  access: AccessContext,
  purchaseOrder: {
    companyId: string;
    projectId: string;
    siteId: string;
    status: PurchaseOrderStatus;
  },
): PurchaseOrderFlags {
  const manage = access.canOn(PURCHASE_ORDER_MANAGE, purchaseOrderTargetOf(purchaseOrder));

  return {
    canEdit: manage && EDITABLE_PURCHASE_ORDER_STATUSES.includes(purchaseOrder.status),
    canCancel: manage && CANCELLABLE_PURCHASE_ORDER_STATUSES.includes(purchaseOrder.status),
  };
}
