import type { Permission } from '@uie/contracts';
import { getCurrentUser } from './session';

/** Server-only: the signed-in user's permissions, or [] without a valid session. */
export async function getCurrentPermissions(): Promise<Permission[]> {
  const user = await getCurrentUser();

  return user === null ? [] : user.permissions;
}
