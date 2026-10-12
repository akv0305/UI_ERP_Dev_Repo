import type { Prisma } from '@prisma/client';
import type { UserResponse } from '@uie/contracts';
import {
  assignmentInclude,
  describeAssignment,
  sortAssignments,
  toAssignmentResponse,
} from '../access/access.service';

export const userWithRolesInclude = {
  roles: { include: assignmentInclude },
} satisfies Prisma.UserInclude;

export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userWithRolesInclude }>;

export function toUserResponse(user: UserWithRoles): UserResponse {
  const distinctRoles = new Map<string, { id: string; code: string; name: string }>();

  for (const link of user.roles) {
    distinctRoles.set(link.role.id, {
      id: link.role.id,
      code: link.role.code,
      name: link.role.name,
    });
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles: [...distinctRoles.values()].sort((a, b) => a.name.localeCompare(b.name)),
    assignments: sortAssignments(user.roles.map(toAssignmentResponse)),
  };
}

/**
 * Audit snapshot of a user. Assignments are readable, for example "PROJECT_MANAGER @ PROJECT P001".
 * Never includes passwordHash or any session/token data.
 */
export function toUserAuditSnapshot(user: UserWithRoles): Record<string, unknown> {
  return {
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    assignments: sortAssignments(user.roles.map(toAssignmentResponse)).map(describeAssignment),
  };
}
