import type { AuditAction } from '@uie/contracts';

/** UPDATE unless the active flag flipped, in which case DEACTIVATE or REACTIVATE. */
export function auditActionFor(wasActive: boolean, isActive: boolean): AuditAction {
  if (wasActive === isActive) {
    return 'UPDATE';
  }

  return isActive ? 'REACTIVATE' : 'DEACTIVATE';
}
