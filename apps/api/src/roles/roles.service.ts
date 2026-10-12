import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  type CreateRoleRequest,
  type Permission,
  type RoleListResponse,
  type RoleResponse,
  type UpdateRoleRequest,
} from '@uie/contracts';
import { ADMINISTRATOR_ROLE_CODE } from '../auth/auth.mapper';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';

const roleInclude = {
  permissions: true,
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type RoleWithCounts = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

/** Audit snapshot of a role: its own fields plus the permission codes it holds. */
export function toRoleAuditSnapshot(role: RoleWithCounts): Record<string, unknown> {
  const { code, name, isSystem, isActive, permissionCodes } = toRoleResponse(role);

  return { code, name, isSystem, isActive, permissionCodes };
}

export function toRoleResponse(role: RoleWithCounts): RoleResponse {
  const held = new Set(role.permissions.map((permission) => permission.permissionCode));
  // ADMINISTRATOR always holds every permission, whatever rows exist.
  const permissionCodes: Permission[] =
    role.code === ADMINISTRATOR_ROLE_CODE
      ? [...ALL_PERMISSIONS]
      : ALL_PERMISSIONS.filter((code) => held.has(code));

  return {
    id: role.id,
    code: role.code,
    name: role.name,
    isSystem: role.isSystem,
    isActive: role.isActive,
    permissionCodes,
    userCount: role._count.users,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleListResponse> {
    const roles = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return { items: roles.map(toRoleResponse) };
  }

  async get(id: string): Promise<RoleResponse> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });

    if (role === null) {
      throw this.notFound();
    }

    return toRoleResponse(role);
  }

  async create(request: CreateRoleRequest, actorId: string): Promise<RoleResponse> {
    this.assertKnownPermissions(request.permissionCodes);
    await this.assertCodeFree(request.code, undefined);

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          code: request.code,
          name: request.name,
          isActive: request.isActive,
          isSystem: false,
          permissions: {
            create: [...new Set(request.permissionCodes)].map((permissionCode) => ({
              permissionCode,
            })),
          },
        },
        include: roleInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'CREATE',
        entityType: 'Role',
        entityId: role.id,
        before: null,
        after: toRoleAuditSnapshot(role),
      });

      return role;
    });

    return toRoleResponse(created);
  }

  async update(id: string, request: UpdateRoleRequest, actorId: string): Promise<RoleResponse> {
    const existing = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });

    if (existing === null) {
      throw this.notFound();
    }

    this.assertKnownPermissions(request.permissionCodes);

    if (existing.isSystem) {
      this.assertSystemRoleUnchanged(toRoleResponse(existing), request);

      return toRoleResponse(existing);
    }

    await this.assertCodeFree(request.code, id);

    const permissionCodes = [...new Set(request.permissionCodes)];
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissionCodes.map((permissionCode) => ({ roleId: id, permissionCode })),
      });

      const role = await tx.role.update({
        where: { id },
        data: { code: request.code, name: request.name, isActive: request.isActive },
        include: roleInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, role.isActive),
        entityType: 'Role',
        entityId: id,
        before: toRoleAuditSnapshot(existing),
        after: toRoleAuditSnapshot(role),
      });

      return role;
    });

    return toRoleResponse(updated);
  }

  /** System roles cannot be renamed, deactivated or have their permissions edited. */
  private assertSystemRoleUnchanged(existing: RoleResponse, request: UpdateRoleRequest): void {
    const requested = new Set<string>(request.permissionCodes);
    const samePermissions =
      existing.permissionCodes.length === requested.size &&
      existing.permissionCodes.every((code) => requested.has(code));

    if (
      request.code !== existing.code ||
      request.name !== existing.name ||
      request.isActive !== existing.isActive ||
      !samePermissions
    ) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'SYSTEM_ROLE_PROTECTED',
        'System roles cannot be renamed, deactivated or have their permissions changed',
      );
    }
  }

  private assertKnownPermissions(codes: string[]): void {
    const unknown = codes.filter((code) => !KNOWN_PERMISSIONS.has(code));

    if (unknown.length > 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Unknown permission code', {
        unknown,
      });
    }
  }

  private async assertCodeFree(code: string, excludeId: string | undefined): Promise<void> {
    const same = await this.prisma.role.findFirst({
      where: { code, ...(excludeId === undefined ? {} : { id: { not: excludeId } }) },
      select: { id: true },
    });

    if (same !== null) {
      throw new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_ROLE_CODE', 'Role code is already in use');
    }
  }

  private notFound(): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Role not found');
  }
}
