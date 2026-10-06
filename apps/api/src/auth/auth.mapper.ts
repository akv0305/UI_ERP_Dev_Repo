import type { Prisma } from '@prisma/client';
import { ALL_PERMISSIONS, type MeResponse, type Permission } from '@uie/contracts';

export const ADMINISTRATOR_ROLE_CODE = 'ADMINISTRATOR';

export const userWithAccessInclude = {
  roles: { include: { role: { include: { permissions: true } } } },
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userWithAccessInclude }>;

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

/** Effective permissions: union of active roles; ADMINISTRATOR always gets everything. */
export function resolvePermissions(user: UserWithAccess): Permission[] {
  const activeRoles = user.roles.map((link) => link.role).filter((role) => role.isActive);

  if (activeRoles.some((role) => role.code === ADMINISTRATOR_ROLE_CODE)) {
    return [...ALL_PERMISSIONS];
  }

  const granted = new Set<string>();

  for (const role of activeRoles) {
    for (const permission of role.permissions) {
      if (KNOWN_PERMISSIONS.has(permission.permissionCode)) {
        granted.add(permission.permissionCode);
      }
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
