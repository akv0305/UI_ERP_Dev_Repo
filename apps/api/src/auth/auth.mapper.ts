import type { Prisma } from '@prisma/client';
import {
  ADMINISTRATOR_ROLE_CODE,
  ALL_PERMISSIONS,
  type MeResponse,
  type Permission,
} from '@uie/contracts';
import { permissionsOf } from '../access/access-context';

export { ADMINISTRATOR_ROLE_CODE };

export const userWithAccessInclude = {
  roles: { include: { role: { include: { permissions: true } } } },
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userWithAccessInclude }>;

/**
 * Effective permissions: union over the user's assignments. ADMINISTRATOR grants everything and
 * administration.* permissions count only from GLOBAL assignments (see access-context.ts).
 */
export function resolvePermissions(user: UserWithAccess): Permission[] {
  const granted = new Set<string>();

  for (const link of user.roles) {
    for (const code of permissionsOf({
      scopeType: link.scopeType,
      companyId: link.companyId,
      projectId: link.projectId,
      siteId: link.siteId,
      role: {
        code: link.role.code,
        isActive: link.role.isActive,
        permissions: link.role.permissions.map((permission) => permission.permissionCode),
      },
    })) {
      granted.add(code);
    }
  }

  return ALL_PERMISSIONS.filter((code) => granted.has(code));
}

export function toMeResponse(user: UserWithAccess): MeResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles
      .map((link) => link.role)
      .filter((role) => role.isActive)
      .map((role) => ({ code: role.code, name: role.name })),
    permissions: resolvePermissions(user),
  };
}
