import type { Permission } from '@uie/contracts';
import { getCurrentPermissions } from './permissions';

export function requirePermission(permission: Permission): boolean {
  return getCurrentPermissions().includes(permission);
}
