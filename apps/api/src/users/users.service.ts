import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateUserRequest,
  PagedUsersResponse,
  RoleOptionsResponse,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserListQuery,
  UserResponse,
} from '@uie/contracts';
import { ADMINISTRATOR_ROLE_CODE } from '../auth/auth.mapper';
import { PasswordService } from '../auth/password.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { toUserResponse, userWithRolesInclude, type UserWithRoles } from './users.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
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
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });

    return { items: roles };
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
    await this.assertRolesExist(request.roleIds);

    const created = await this.prisma.user.create({
      data: {
        username: request.username,
        email: request.email,
        displayName: request.displayName,
        isActive: request.isActive,
        passwordHash: await this.passwords.hash(request.temporaryPassword),
        mustChangePassword: true,
        createdById: actorId,
        updatedById: actorId,
        roles: { create: [...new Set(request.roleIds)].map((roleId) => ({ roleId })) },
      },
      include: userWithRolesInclude,
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
    await this.assertRolesExist(request.roleIds);
    await this.assertAdministratorRetained(existing, request);

    const roleIds = [...new Set(request.roleIds)];
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });

      return tx.user.update({
        where: { id },
        data: {
          username: request.username,
          email: request.email,
          displayName: request.displayName,
          isActive: request.isActive,
          updatedById: actorId,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
        include: userWithRolesInclude,
      });
    });

    if (!request.isActive && existing.isActive) {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return toUserResponse(updated);
  }

  async resetPassword(id: string, request: ResetPasswordRequest, actorId: string): Promise<void> {
    await this.assertExists(id);

    const passwordHash = await this.passwords.hash(request.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, updatedById: actorId },
      }),
      this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async unlock(id: string, actorId: string): Promise<void> {
    await this.assertExists(id);

    await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null, updatedById: actorId },
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

  private async assertRolesExist(roleIds: string[]): Promise<void> {
    const unique = [...new Set(roleIds)];

    if (unique.length === 0) {
      return;
    }

    const count = await this.prisma.role.count({ where: { id: { in: unique } } });

    if (count !== unique.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_ROLE', 'One or more roles do not exist');
    }
  }

  /** The last active ADMINISTRATOR cannot be deactivated or lose the role. */
  private async assertAdministratorRetained(
    existing: UserWithRoles,
    request: UpdateUserRequest,
  ): Promise<void> {
    const adminLink = existing.roles.find((link) => link.role.code === ADMINISTRATOR_ROLE_CODE);

    if (adminLink === undefined || !existing.isActive) {
      return;
    }

    if (request.isActive && request.roleIds.includes(adminLink.role.id)) {
      return;
    }

    const otherActiveAdmins = await this.prisma.user.count({
      where: {
        id: { not: existing.id },
        isActive: true,
        roles: { some: { role: { code: ADMINISTRATOR_ROLE_CODE, isActive: true } } },
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
