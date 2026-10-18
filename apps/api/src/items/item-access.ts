import type { ItemStatus, Permission } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { forbidden } from '../masters/scope';

export const ITEM_VIEW: Permission = 'masters.items.view';
export const ITEM_MANAGE: Permission = 'masters.items.manage';
export const ITEM_APPROVE: Permission = 'masters.items.approve';

/** Statuses in which the maker may edit and submit an item (PD-041). */
export const EDITABLE_ITEM_STATUSES: readonly ItemStatus[] = ['DRAFT', 'REJECTED'];

/** Units, categories and items are shared by all companies: only GLOBAL assignments count. */
const SHARED = { global: true };

export function canManageItems(access: AccessContext): boolean {
  return access.canOn(ITEM_MANAGE, SHARED);
}

/** Viewing the shared catalogue counts from an assignment at any scope (PD-043). */
export function canViewItems(access: AccessContext): boolean {
  return access.holds(ITEM_VIEW) || canManageItems(access);
}

export function canApproveItems(access: AccessContext): boolean {
  return access.canOn(ITEM_APPROVE, SHARED);
}

export function assertCanViewItems(access: AccessContext): void {
  if (!canViewItems(access)) {
    throw forbidden();
  }
}

export function assertCanManageItems(access: AccessContext): void {
  if (!canManageItems(access)) {
    throw forbidden();
  }
}

export function assertCanApproveItems(access: AccessContext): void {
  if (!canApproveItems(access)) {
    throw forbidden();
  }
}

export interface ItemFlags {
  canEdit: boolean;
  canManage: boolean;
  canApprove: boolean;
  canReopen: boolean;
}

/** What the signed-in user may do with one item, given its status. */
export function itemFlagsFor(
  access: AccessContext,
  item: { status: ItemStatus; isActive: boolean },
): ItemFlags {
  const manage = canManageItems(access);
  const approve = canApproveItems(access);

  return {
    canEdit: manage && item.isActive && EDITABLE_ITEM_STATUSES.includes(item.status),
    canManage: manage,
    canApprove: approve && item.isActive && item.status === 'PENDING_APPROVAL',
    canReopen: approve && item.isActive && item.status === 'APPROVED',
  };
}
