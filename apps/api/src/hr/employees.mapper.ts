import type { Prisma } from '@prisma/client';
import type { EmployeeResponse, EmployeeStatus } from '@uie/contracts';
import { fromDateOnly } from '../masters/master-helpers';

const summarySelect = { id: true, code: true, name: true, isActive: true } as const;

export const employeeInclude = {
  company: { select: { id: true, code: true, legalName: true, isActive: true } },
  designation: { select: summarySelect },
  project: { select: summarySelect },
  site: { select: summarySelect },
  user: { select: { id: true, username: true, isActive: true } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithRelations = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

/** LEFT once the leaving date is today or earlier, IST (OQ-134, OQ-141). */
export function employeeStatusOf(dateOfLeaving: Date | null, today: string): EmployeeStatus {
  const leaving = fromDateOnly(dateOfLeaving);

  return leaving !== null && leaving <= today ? 'LEFT' : 'ACTIVE';
}

export function toEmployeeResponse(
  employee: EmployeeWithRelations,
  canManage: boolean,
  today: string,
): EmployeeResponse {
  const status = employeeStatusOf(employee.dateOfLeaving, today);

  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    code: employee.code,
    fullName: employee.fullName,
    company: {
      id: employee.company.id,
      code: employee.company.code,
      name: employee.company.legalName,
      isActive: employee.company.isActive,
    },
    designation: employee.designation,
    workLocationType: employee.workLocationType,
    project: employee.project,
    site: employee.site,
    dateOfJoining: fromDateOnly(employee.dateOfJoining),
    dateOfLeaving: fromDateOnly(employee.dateOfLeaving),
    officialEmail: employee.officialEmail,
    mobile: employee.mobile,
    status,
    user: employee.user,
    isActive: employee.isActive,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    canManage,
    canCreateUser: canManage && employee.user === null && employee.isActive && status === 'ACTIVE',
  };
}

/** Readable values for the Audit Log (codes and names, not ids). */
export function toEmployeeAuditSnapshot(employee: EmployeeWithRelations): Record<string, unknown> {
  return {
    employeeNo: employee.employeeNo,
    code: employee.code,
    fullName: employee.fullName,
    company: employee.company.code,
    designation: employee.designation?.name ?? null,
    workLocationType: employee.workLocationType,
    project: employee.project?.code ?? null,
    site: employee.site?.code ?? null,
    dateOfJoining: fromDateOnly(employee.dateOfJoining),
    dateOfLeaving: fromDateOnly(employee.dateOfLeaving),
    officialEmail: employee.officialEmail,
    mobile: employee.mobile,
    user: employee.user?.username ?? null,
    isActive: employee.isActive,
  };
}
