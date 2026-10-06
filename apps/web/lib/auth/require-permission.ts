import type { Permission } from '@uie/contracts';
import { getCurrentPermissions } from './permissions';

export async function requirePermission(permission: Permission): Promise<boolean> {
  return (await getCurrentPermissions()).includes(permission);
}
