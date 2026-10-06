import type { Prisma } from '@prisma/client';
import type { UserResponse } from '@uie/contracts';

export const userWithRolesInclude = {
  roles: { include: { role: true } },
} satisfies Prisma.UserInclude;

export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userWithRolesInclude }>;

export function toUserResponse(user: UserWithRoles): UserResponse {
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
    roles: user.roles
      .map((link) => ({ id: link.role.id, code: link.role.code, name: link.role.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
