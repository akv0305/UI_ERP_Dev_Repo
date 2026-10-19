import type { Permission, VendorStatus } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { forbidden } from '../masters/scope';

export const VENDOR_VIEW: Permission = 'masters.vendors.view';
export const VENDOR_MANAGE: Permission = 'masters.vendors.manage';
export const VENDOR_APPROVE: Permission = 'masters.vendors.approve';

/** Statuses in which the maker may edit and submit a vendor (PD-044, as items PD-041). */
export const EDITABLE_VENDOR_STATUSES: readonly VendorStatus[] = ['DRAFT', 'REJECTED'];

/** Vendors are shared by all companies: manage/approve count only from GLOBAL assignments. */
const SHARED = { global: true };

export function canManageVendors(access: AccessContext): boolean {
  return access.canOn(VENDOR_MANAGE, SHARED);
}

/** Viewing counts from an assignment at any scope (same rule as items, PD-043). */
export function canViewVendors(access: AccessContext): boolean {
  return access.holds(VENDOR_VIEW) || canManageVendors(access);
}

export function canApproveVendors(access: AccessContext): boolean {
  return access.canOn(VENDOR_APPROVE, SHARED);
}

export function assertCanViewVendors(access: AccessContext): void {
  if (!canViewVendors(access)) {
    throw forbidden();
  }
}

export function assertCanManageVendors(access: AccessContext): void {
  if (!canManageVendors(access)) {
    throw forbidden();
  }
}

export function assertCanApproveVendors(access: AccessContext): void {
  if (!canApproveVendors(access)) {
    throw forbidden();
  }
}

export interface VendorFlags {
  canEdit: boolean;
  canManage: boolean;
  canApprove: boolean;
  canReopen: boolean;
}

/** What the signed-in user may do with one vendor. The submitter never approves (OQ-35 b). */
export function vendorFlagsFor(
  access: AccessContext,
  vendor: { status: VendorStatus; isActive: boolean; submittedById: string | null },
  actorId: string,
): VendorFlags {
  const manage = canManageVendors(access);
  const approve = canApproveVendors(access);

  return {
    canEdit: manage && vendor.isActive && EDITABLE_VENDOR_STATUSES.includes(vendor.status),
    canManage: manage,
    canApprove:
      approve &&
      vendor.isActive &&
      vendor.status === 'PENDING_APPROVAL' &&
      vendor.submittedById !== actorId,
    canReopen: approve && vendor.isActive && vendor.status === 'APPROVED',
  };
}
