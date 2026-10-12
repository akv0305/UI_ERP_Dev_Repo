import type { Prisma } from '@prisma/client';
import {
  ADMINISTRATOR_ROLE_CODE,
  ALL_PERMISSIONS,
  type MeResponse,
  type Permission,
  type SessionContext,
} from '@uie/contracts';
import { permissionsOf } from '../access/access-context';
import { assignmentInclude, sortAssignments, toAssignmentResponse } from '../access/access.service';

export { ADMINISTRATOR_ROLE_CODE };

export const userWithAccessInclude = {
  roles: { include: assignmentInclude },
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

export const NO_CONTEXT: SessionContext = {
  companyId: null,
  companyLabel: null,
  projectId: null,
  projectLabel: null,
};

/** The "CODE — Name" label used in pick lists and the shell switchers. */
export function codeLabel(code: string, name: string): string {
  return `${code} — ${name}`;
}

export function toMeResponse(
  user: UserWithAccess,
  context: SessionContext = NO_CONTEXT,
): MeResponse {
  const activeLinks = user.roles.filter((link) => link.role.isActive);
  const roles = new Map<string, { code: string; name: string }>();

  for (const link of activeLinks) {
    roles.set(link.role.code, { code: link.role.code, name: link.role.name });
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
    roles: [...roles.values()],
    permissions: resolvePermissions(user),
    assignments: sortAssignments(activeLinks.map(toAssignmentResponse)),
    context,
  };
}
