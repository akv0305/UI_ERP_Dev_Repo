import type { Permission } from '@/config/navigation';
import { getCurrentPermissions } from './permissions';

export function requirePermission(permission: Permission): boolean {
  return getCurrentPermissions().includes(permission);
}
