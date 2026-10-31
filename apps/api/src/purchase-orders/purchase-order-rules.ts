import type { Permission, PurchaseOrderStatus } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { indentTargetOf, type IndentTarget } from '../indents/indent-rules';

export const PURCHASE_ORDER_VIEW: Permission = 'purchase.purchaseOrders.view';
export const PURCHASE_ORDER_MANAGE: Permission = 'purchase.purchaseOrders.manage';

/** Only a draft may be edited or submitted. */
export const EDITABLE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ['DRAFT'];

/** Draft or submitted POs may be cancelled (OQ-72). */
export const CANCELLABLE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
];

/** Not cancelled: counts as the one live PO per comparison + vendor (OQ-83). */
export const LIVE_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ['DRAFT', 'SUBMITTED'];

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
