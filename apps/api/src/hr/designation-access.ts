import type { Permission } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { forbidden } from '../masters/scope';

export const DESIGNATION_VIEW: Permission = 'hr.designations.view';
export const DESIGNATION_MANAGE: Permission = 'hr.designations.manage';

/** Designations are shared by all companies: only GLOBAL assignments count for manage (OQ-144 a). */
const SHARED = { global: true };

export function canManageDesignations(access: AccessContext): boolean {
  return access.canOn(DESIGNATION_MANAGE, SHARED);
}

/** Viewing counts from an assignment at any scope. */
export function canViewDesignations(access: AccessContext): boolean {
  return access.holds(DESIGNATION_VIEW) || canManageDesignations(access);
}

export function assertCanViewDesignations(access: AccessContext): void {
  if (!canViewDesignations(access)) {
    throw forbidden();
  }
}

export function assertCanManageDesignations(access: AccessContext): void {
  if (!canManageDesignations(access)) {
    throw forbidden();
  }
}
