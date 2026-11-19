import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ADMINISTRATOR_ROLE_CODE,
  type CreateEmployeeUserRequest,
  type EmployeeResponse,
  type LinkEmployeeUserRequest,
  type LinkableUsersResponse,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { notFound } from '../masters/master-helpers';
import { assertManageable } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import { toUserAuditSnapshot, userWithRolesInclude } from '../users/users.mapper';
import { assertUserFieldsFree } from './employee-user-rules';
import {
  employeeInclude,
  employeeStatusOf,
  toEmployeeAuditSnapshot,
  toEmployeeResponse,
  type EmployeeWithRelations,
} from './employees.mapper';
import { EMPLOYEE_PERMISSIONS } from './employees.service';
import { todayIst } from './hr-dates';
import { employeeNotActive, guardUserUnique, invalidUser, userAlreadyLinked } from './hr-errors';

const ENTITY = 'Employee';

/** Create or link the sign-in user of an employee (OQ-148 a, OQ-149 b). */
@Injectable()
export class EmployeeUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  /** Active users not linked to any employee and never an administrator (OQ-149). */
  async linkableUsers(id: string, access: AccessContext): Promise<LinkableUsersResponse> {
    await this.requireLinkable(id, access);

    const linked = await this.prisma.employee.findMany({
      where: { userId: { not: null } },
      select: { userId: true },
    });
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { notIn: linked.flatMap((row) => (row.userId === null ? [] : [row.userId])) },
        roles: { none: { role: { code: ADMINISTRATOR_ROLE_CODE } } },
      },
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
      select: { id: true, username: true, displayName: true, email: true },
    });

    return {
      items: users.map((user) => ({
        id: user.id,
        label: `${user.username} — ${user.displayName}`,
        email: user.email,
      })),
    };
  }

  /** New user with no roles and a forced password change at first sign-in (OQ-137). */
  async createUser(
    id: string,
    request: CreateEmployeeUserRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EmployeeResponse> {
    const employee = await this.requireLinkable(id, access);

    await assertUserFieldsFree(this.prisma, employee.code, employee.officialEmail, null);

    const passwordHash = await this.passwords.hash(request.temporaryPassword);
    const updated = await guardUserUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: employee.code,
            displayName: employee.fullName,
            email: employee.officialEmail,
            isActive: true,
            passwordHash,
            mustChangePassword: true,
            createdById: actorId,
            updatedById: actorId,
          },
          include: userWithRolesInclude,
        });
        const linkedEmployee = await this.link(tx, employee, user.id, actorId);

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          before: null,
          after: toUserAuditSnapshot(user),
        });

        return linkedEmployee;
      }),
    );

    return toEmployeeResponse(updated, true, todayIst());
  }

  /** Username becomes the Employee Code; email the official email when entered; roles kept (OQ-149). */
  async linkUser(
    id: string,
    request: LinkEmployeeUserRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EmployeeResponse> {
    const employee = await this.requireLinkable(id, access);
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      include: userWithRolesInclude,
    });

    if (
      user === null ||
      !user.isActive ||
      user.roles.some((link) => link.role.code === ADMINISTRATOR_ROLE_CODE)
    ) {
      throw invalidUser();
    }

    const otherEmployee = await this.prisma.employee.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (otherEmployee !== null) {
      throw userAlreadyLinked();
    }

    const email = employee.officialEmail ?? user.email;

    await assertUserFieldsFree(this.prisma, employee.code, email, user.id);

    const updated = await guardUserUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const renamed = await tx.user.update({
          where: { id: user.id },
          data: {
            username: employee.code,
            displayName: employee.fullName,
            email,
            updatedById: actorId,
          },
          include: userWithRolesInclude,
        });
        const linkedEmployee = await this.link(tx, employee, user.id, actorId);

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          before: toUserAuditSnapshot(user),
          after: toUserAuditSnapshot(renamed),
        });

        return linkedEmployee;
      }),
    );

    return toEmployeeResponse(updated, true, todayIst());
  }

  /** Sets employees.userId only if still empty, so two concurrent links cannot both win. */
  private async link(
    tx: Prisma.TransactionClient,
    employee: EmployeeWithRelations,
    userId: string,
    actorId: string,
  ): Promise<EmployeeWithRelations> {
    const { count } = await tx.employee.updateMany({
      where: { id: employee.id, userId: null },
      data: { userId, updatedById: actorId },
    });

    if (count === 0) {
      throw userAlreadyLinked();
    }

    const linked = await tx.employee.findUniqueOrThrow({
      where: { id: employee.id },
      include: employeeInclude,
    });

    await this.audit.record(tx, {
      actorUserId: actorId,
      action: 'UPDATE',
      entityType: 'Employee',
      entityId: employee.id,
      companyId: employee.companyId,
      before: toEmployeeAuditSnapshot(employee),
      after: toEmployeeAuditSnapshot(linked),
    });

    return linked;
  }

  /** Manageable, active, not Left and without a user. */
  private async requireLinkable(id: string, access: AccessContext): Promise<EmployeeWithRelations> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });

    if (employee === null) {
      throw notFound(ENTITY);
    }

    assertManageable(access, EMPLOYEE_PERMISSIONS, { companyId: employee.companyId }, ENTITY);

    if (!employee.isActive || employeeStatusOf(employee.dateOfLeaving, todayIst()) === 'LEFT') {
      throw employeeNotActive();
    }

    if (employee.userId !== null) {
      throw userAlreadyLinked();
    }

    return employee;
  }
}
