import type { Permission } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { forbidden } from '../masters/scope';

export const ITEM_VIEW: Permission = 'masters.items.view';
export const ITEM_MANAGE: Permission = 'masters.items.manage';
export const ITEM_APPROVE: Permission = 'masters.items.approve';

/** Units, categories and items are shared by all companies: only GLOBAL assignments count. */
const SHARED = { global: true };

export function canManageItems(access: AccessContext): boolean {
  return access.canOn(ITEM_MANAGE, SHARED);
}

export function canViewItems(access: AccessContext): boolean {
  return access.canOn(ITEM_VIEW, SHARED) || canManageItems(access);
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
