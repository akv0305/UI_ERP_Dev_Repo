import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ADMIN_PERMISSION_PREFIX,
  hasValidScopeShape,
  type CreateUserRequest,
  type PagedUsersResponse,
  type ResetPasswordRequest,
  type RoleAssignmentInput,
  type RoleOptionsResponse,
  type ScopeOptionsResponse,
  type UpdateUserRequest,
  type UserListQuery,
  type UserResponse,
} from '@uie/contracts';
import { ADMINISTRATOR_ROLE_CODE, codeLabel } from '../auth/auth.mapper';
import { PasswordService } from '../auth/password.service';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import {
  toUserAuditSnapshot,
  toUserResponse,
  userWithRolesInclude,
  type UserWithRoles,
} from './users.mapper';

/** Identity of an assignment: the same role at the same scope and target. */
function assignmentKey(assignment: {
  roleId: string;
  scopeType: string;
  companyId: string | null;
  projectId: string | null;
  siteId: string | null;
}): string {
  return [
    assignment.roleId,
    assignment.scopeType,
    assignment.companyId ?? '',
    assignment.projectId ?? '',
    assignment.siteId ?? '',
  ].join('|');
}

function assignmentRow(userId: string, assignment: RoleAssignmentInput, actorId: string) {
  return {
    userId,
    roleId: assignment.roleId,
    scopeType: assignment.scopeType,
    companyId: assignment.companyId,
    projectId: assignment.projectId,
    siteId: assignment.siteId,
    createdById: actorId,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UserListQuery): Promise<PagedUsersResponse> {
    const where: Prisma.UserWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.active !== undefined) {
      where.isActive = query.active === 'true';
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userWithRolesInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: users.map(toUserResponse),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async roleOptions(): Promise<RoleOptionsResponse> {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        permissions: { select: { permissionCode: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      items: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        isActive: role.isActive,
        requiresGlobalScope: requiresGlobalScope(role),
      })),
    };
  }

  /** Active companies, projects and sites a role can be assigned to (for the user form). */
  async scopeOptions(): Promise<ScopeOptionsResponse> {
    const [companies, projects, sites] = await Promise.all([
      this.prisma.company.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, legalName: true },
      }),
      this.prisma.project.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true, companyId: true },
      }),
      this.prisma.site.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true, projectId: true },
      }),
    ]);

    return {
      companies: companies.map((row) => ({
        id: row.id,
        label: codeLabel(row.code, row.legalName),
      })),
      projects: projects.map((row) => ({
        id: row.id,
        label: codeLabel(row.code, row.name),
        companyId: row.companyId,
      })),
      sites: sites.map((row) => ({
        id: row.id,
        label: codeLabel(row.code, row.name),
        projectId: row.projectId,
      })),
    };
  }

  async get(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithRolesInclude,
    });

    if (user === null) {
      throw this.notFound();
    }

    return toUserResponse(user);
  }

  async create(request: CreateUserRequest, actorId: string): Promise<UserResponse> {
    await this.assertUnique(request.username, request.email, undefined);
    await this.assertAssignmentsValid(request.assignments, new Set());

    const passwordHash = await this.passwords.hash(request.temporaryPassword);
    const created = await this.prisma.$transaction(async (tx) => {
      const { id } = await tx.user.create({
        data: {
          username: request.username,
          email: request.email,
          displayName: request.displayName,
          isActive: request.isActive,
          passwordHash,
          mustChangePassword: true,
          createdById: actorId,
          updatedById: actorId,
        },
        select: { id: true },
      });

      if (request.assignments.length > 0) {
        await tx.userRole.createMany({
          data: request.assignments.map((assignment) => assignmentRow(id, assignment, actorId)),
        });
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id },
        include: userWithRolesInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'CREATE',
        entityType: 'User',
        entityId: user.id,
        before: null,
        after: toUserAuditSnapshot(user),
      });

      return user;
    });

    return toUserResponse(created);
  }

  async update(id: string, request: UpdateUserRequest, actorId: string): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: userWithRolesInclude,
    });

    if (existing === null) {
      throw this.notFound();
    }

    if (!request.isActive && existing.isActive && id === actorId) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'CANNOT_DEACTIVATE_SELF',
        'You cannot deactivate your own account',
      );
    }

    await this.assertUnique(request.username, request.email, id);

    // Assignments the user already holds may point at targets that were deactivated since.
    const held = new Set(existing.roles.map((link) => assignmentKey(link)));

    await this.assertAssignmentsValid(request.assignments, held);
    await this.assertAdministratorRetained(existing, request);

    // Only the difference is written: unchanged assignments keep their id and creation data.
    const requested = new Set(request.assignments.map((assignment) => assignmentKey(assignment)));
    const removedIds = existing.roles
      .filter((link) => !requested.has(assignmentKey(link)))
      .map((link) => link.id);
    const added = request.assignments.filter((assignment) => !held.has(assignmentKey(assignment)));

    const updated = await this.prisma.$transaction(async (tx) => {
      if (removedIds.length > 0) {
        await tx.userRole.deleteMany({ where: { id: { in: removedIds } } });
      }

      if (added.length > 0) {
        await tx.userRole.createMany({
          data: added.map((assignment) => assignmentRow(id, assignment, actorId)),
        });
      }

      await tx.user.update({
        where: { id },
        data: {
          username: request.username,
          email: request.email,
          displayName: request.displayName,
          isActive: request.isActive,
          updatedById: actorId,
        },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id },
        include: userWithRolesInclude,
      });

      if (!request.isActive && existing.isActive) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, user.isActive),
        entityType: 'User',
        entityId: id,
        before: toUserAuditSnapshot(existing),
        after: toUserAuditSnapshot(user),
      });

      return user;
    });

    return toUserResponse(updated);
  }

  async resetPassword(id: string, request: ResetPasswordRequest, actorId: string): Promise<void> {
    await this.assertExists(id);

    const passwordHash = await this.passwords.hash(request.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, updatedById: actorId },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'User',
        entityId: id,
        before: null,
        after: { passwordReset: true },
      });
    });
  }

  async unlock(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, failedLoginCount: true, lockedUntil: true },
    });

    if (existing === null) {
      throw this.notFound();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null, updatedById: actorId },
      });
      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'User',
        entityId: id,
        before: { failedLoginCount: existing.failedLoginCount, lockedUntil: existing.lockedUntil },
        after: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  }

  private async assertExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (user === null) {
      throw this.notFound();
    }
  }

  private async assertUnique(
    username: string,
    email: string | null,
    excludeId: string | undefined,
  ): Promise<void> {
    const exclude = excludeId === undefined ? {} : { id: { not: excludeId } };
    const sameUsername = await this.prisma.user.findFirst({
      where: { ...exclude, username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });

    if (sameUsername !== null) {
      throw new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_USERNAME', 'Username is already in use');
    }

    if (email !== null) {
      const sameEmail = await this.prisma.user.findFirst({
        where: { ...exclude, email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });

      if (sameEmail !== null) {
        throw new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_EMAIL', 'Email is already in use');
      }
    }
  }

  /**
   * Validates a full assignment list, in this order: scope shape, duplicates, roles exist,
   * global-only roles, targets. `held` holds the keys of assignments the user already has: those may
   * keep pointing at an inactive target; a NEW assignment may not.
   */
  private async assertAssignmentsValid(
    assignments: RoleAssignmentInput[],
    held: ReadonlySet<string>,
  ): Promise<void> {
    if (assignments.some((assignment) => !hasValidScopeShape(assignment))) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_SCOPE',
        'Each assignment needs exactly the target that matches its scope',
      );
    }

    const keys = assignments.map((assignment) => assignmentKey(assignment));

    if (new Set(keys).size !== keys.length) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'DUPLICATE_ASSIGNMENT',
        'The same role is assigned twice for the same scope',
      );
    }

    const roleIds = [...new Set(assignments.map((assignment) => assignment.roleId))];
    const roles =
      roleIds.length === 0
        ? []
        : await this.prisma.role.findMany({
            where: { id: { in: roleIds } },
            select: { id: true, code: true, permissions: { select: { permissionCode: true } } },
          });

    if (roles.length !== roleIds.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_ROLE', 'One or more roles do not exist');
    }

    const roleById = new Map(roles.map((role) => [role.id, role]));

    for (const assignment of assignments) {
      const role = roleById.get(assignment.roleId);

      if (role === undefined || assignment.scopeType === 'GLOBAL') {
        continue;
      }

      if (role.code === ADMINISTRATOR_ROLE_CODE) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'ADMIN_ROLE_MUST_BE_GLOBAL',
          'The Administrator role can only be assigned with global scope',
        );
      }

      if (requiresGlobalScope(role)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'ROLE_HAS_ADMIN_PERMISSIONS_MUST_BE_GLOBAL',
          'A role with administration permissions can only be assigned with global scope',
        );
      }
    }

    await this.assertTargets(assignments, held);
  }

  /** Each target must exist (INVALID_SCOPE) and, if the assignment is new, be active. */
  private async assertTargets(
    assignments: RoleAssignmentInput[],
    held: ReadonlySet<string>,
  ): Promise<void> {
    const idsOf = (pick: (assignment: RoleAssignmentInput) => string | null): string[] => [
      ...new Set(assignments.flatMap((assignment) => pick(assignment) ?? [])),
    ];
    const companyIds = idsOf((assignment) => assignment.companyId);
    const projectIds = idsOf((assignment) => assignment.projectId);
    const siteIds = idsOf((assignment) => assignment.siteId);
    const [companies, projects, sites] = await Promise.all([
      companyIds.length === 0
        ? []
        : this.prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, isActive: true },
          }),
      projectIds.length === 0
        ? []
        : this.prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, isActive: true },
          }),
      siteIds.length === 0
        ? []
        : this.prisma.site.findMany({
            where: { id: { in: siteIds } },
            select: { id: true, isActive: true },
          }),
    ]);
    const activeById = new Map<string, boolean>(
      [...companies, ...projects, ...sites].map((row) => [row.id, row.isActive]),
    );

    for (const assignment of assignments) {
      const targetId = assignment.companyId ?? assignment.projectId ?? assignment.siteId;

      if (targetId === null) {
        continue;
      }

      const isActive = activeById.get(targetId);

      if (isActive === undefined) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_SCOPE',
          'The company, project or site does not exist',
        );
      }

      if (!isActive && !held.has(assignmentKey(assignment))) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'SCOPE_TARGET_INACTIVE',
          'A new assignment cannot point at an inactive company, project or site',
        );
      }
    }
  }

  /**
   * The last active administrator cannot be deactivated or lose the role. Only GLOBAL ADMINISTRATOR
   * assignments of active users count, because a scoped one grants nothing.
   */
  private async assertAdministratorRetained(
    existing: UserWithRoles,
    request: UpdateUserRequest,
  ): Promise<void> {
    const adminLink = existing.roles.find(
      (link) => link.scopeType === 'GLOBAL' && link.role.code === ADMINISTRATOR_ROLE_CODE,
    );

    if (adminLink === undefined || !existing.isActive) {
      return;
    }

    const keepsAdmin = request.assignments.some(
      (assignment) => assignment.scopeType === 'GLOBAL' && assignment.roleId === adminLink.roleId,
    );

    if (request.isActive && keepsAdmin) {
      return;
    }

    const otherActiveAdmins = await this.prisma.user.count({
      where: {
        id: { not: existing.id },
        isActive: true,
        roles: {
          some: { scopeType: 'GLOBAL', role: { code: ADMINISTRATOR_ROLE_CODE, isActive: true } },
        },
      },
    });

    if (otherActiveAdmins === 0) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'LAST_ADMINISTRATOR',
        'The last active administrator cannot be deactivated or lose the Administrator role',
      );
    }
  }

  private notFound(): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
  }
}

/** ADMINISTRATOR, or any role holding an administration.* permission, can only be assigned globally. */
function requiresGlobalScope(role: {
  code: string;
  permissions: Array<{ permissionCode: string }>;
}): boolean {
  return (
    role.code === ADMINISTRATOR_ROLE_CODE ||
    role.permissions.some((permission) =>
      permission.permissionCode.startsWith(ADMIN_PERMISSION_PREFIX),
    )
  );
}
