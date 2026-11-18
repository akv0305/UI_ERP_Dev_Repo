import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  emailMatchesDomain,
  type CreateEmployeeRequest,
  type EmployeeFormOptionsResponse,
  type EmployeeListQuery,
  type EmployeeResponse,
  type PagedEmployeesResponse,
  type UpdateEmployeeRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { EMPLOYEE_SERIES, nextCode } from '../masters/code-series';
import { parentInactive } from '../masters/hierarchy-errors';
import { notFound, pageOf, toDateOnly } from '../masters/master-helpers';
import {
  assertManageable,
  assertVisible,
  canManage,
  idFilter,
  type EntityPermissions,
} from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  employeeInclude,
  toEmployeeAuditSnapshot,
  toEmployeeResponse,
  type EmployeeWithRelations,
} from './employees.mapper';
import { todayIst } from './hr-dates';
import {
  codeChangeRemarksRequired,
  duplicateEmail,
  duplicateEmployeeCode,
  guardEmployeeUnique,
  invalidCompany,
  invalidDates,
  invalidDesignation,
  invalidEmailDomain,
  invalidWorkLocation,
} from './hr-errors';

const ENTITY = 'Employee';

/** Checked against the employee's company only, so project/site assignments never cover it (OQ-145 a). */
export const EMPLOYEE_PERMISSIONS: EntityPermissions = {
  view: 'hr.employees.view',
  manage: 'hr.employees.manage',
};

type EmployeeInput = Omit<CreateEmployeeRequest, 'companyId'>;

interface CompanyForEmployee {
  id: string;
  isActive: boolean;
  emailDomain: string | null;
}

const companyForEmployeeSelect = { id: true, isActive: true, emailDomain: true } as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: EmployeeListQuery, access: AccessContext): Promise<PagedEmployeesResponse> {
    const visible = await access.accessibleCompanyIds([
      EMPLOYEE_PERMISSIONS.view,
      EMPLOYEE_PERMISSIONS.manage,
    ]);
    const today = todayIst();
    const todayDate = toDateOnly(today) as Date;
    const and: Prisma.EmployeeWhereInput[] = [{ companyId: idFilter(visible) }];

    if (query.companyId !== undefined) {
      and.push({ companyId: query.companyId });
    }

    if (query.designationId !== undefined) {
      and.push({ designationId: query.designationId });
    }

    if (query.isActive !== undefined) {
      and.push({ isActive: query.isActive === 'true' });
    }

    if (query.status === 'LEFT') {
      and.push({ dateOfLeaving: { lte: todayDate } });
    } else if (query.status === 'ACTIVE') {
      and.push({ OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: todayDate } }] });
    }

    if (query.search !== undefined && query.search.length > 0) {
      and.push({
        OR: [
          { employeeNo: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { officialEmail: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.EmployeeWhereInput = { AND: and };
    const [total, employees] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      employees.map((employee) =>
        toEmployeeResponse(
          employee,
          canManage(access, EMPLOYEE_PERMISSIONS, { companyId: employee.companyId }),
          today,
        ),
      ),
      total,
      query,
    );
  }

  /** Pick lists for the employee form (hr.employees.manage). */
  async formOptions(access: AccessContext): Promise<EmployeeFormOptionsResponse> {
    const covered = await access.accessibleCompanyIds(EMPLOYEE_PERMISSIONS.manage);
    const companies = await this.prisma.company.findMany({
      where: { isActive: true, id: idFilter(covered) },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, legalName: true },
    });
    const [designations, projects] = await Promise.all([
      this.prisma.designation.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.project.findMany({
        where: { isActive: true, companyId: { in: companies.map((company) => company.id) } },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true, companyId: true },
      }),
    ]);
    const sites = await this.prisma.site.findMany({
      where: { isActive: true, projectId: { in: projects.map((project) => project.id) } },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, projectId: true },
    });

    return {
      companies: companies.map((company) => ({
        id: company.id,
        label: codeLabel(company.code, company.legalName),
      })),
      designations: designations.map((designation) => ({
        id: designation.id,
        label: designation.name,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        label: codeLabel(project.code, project.name),
        companyId: project.companyId,
      })),
      sites: sites.map((site) => ({
        id: site.id,
        label: codeLabel(site.code, site.name),
        projectId: site.projectId,
      })),
    };
  }

  async get(id: string, access: AccessContext): Promise<EmployeeResponse> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });

    if (employee === null) {
      throw notFound(ENTITY);
    }

    assertVisible(access, EMPLOYEE_PERMISSIONS, { companyId: employee.companyId }, ENTITY);

    return toEmployeeResponse(
      employee,
      canManage(access, EMPLOYEE_PERMISSIONS, { companyId: employee.companyId }),
      todayIst(),
    );
  }

  async create(
    request: CreateEmployeeRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EmployeeResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: request.companyId },
      select: companyForEmployeeSelect,
    });

    // Not found, inactive or not managed by the user: one answer, so existence is not revealed.
    if (
      company === null ||
      !company.isActive ||
      !canManage(access, EMPLOYEE_PERMISSIONS, { companyId: company.id })
    ) {
      throw invalidCompany();
    }

    const { companyId: _companyId, ...fields } = request;

    await this.validate(fields, company, null);

    const created = await guardEmployeeUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const employeeNo = await nextCode(tx, EMPLOYEE_SERIES);
        const employee = await tx.employee.create({
          data: {
            ...this.dataOf(fields),
            employeeNo,
            companyId: company.id,
            createdById: actorId,
            updatedById: actorId,
          },
          include: employeeInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Employee',
          entityId: employee.id,
          companyId: employee.companyId,
          before: null,
          after: toEmployeeAuditSnapshot(employee),
        });

        return employee;
      }),
    );

    return toEmployeeResponse(created, true, todayIst());
  }

  async update(
    id: string,
    request: UpdateEmployeeRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<EmployeeResponse> {
    const existing = await this.requireManageable(id, access);
    const { codeChangeRemarks, ...fields } = request;
    const codeChanged = fields.code !== existing.code;

    if (codeChanged && codeChangeRemarks === null) {
      throw codeChangeRemarksRequired();
    }

    const company = await this.prisma.company.findUnique({
      where: { id: existing.companyId },
      select: companyForEmployeeSelect,
    });

    if (company === null) {
      throw notFound(ENTITY);
    }

    await this.validate(fields, company, existing);

    // The linked username follows a code change (OQ-135) once users can be linked (batch 4).
    const updated = await guardEmployeeUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.update({
          where: { id },
          data: { ...this.dataOf(fields), updatedById: actorId },
          include: employeeInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'Employee',
          entityId: id,
          companyId: employee.companyId,
          before: toEmployeeAuditSnapshot(existing),
          after: {
            ...toEmployeeAuditSnapshot(employee),
            ...(codeChanged ? { codeChangeRemarks } : {}),
          },
        });

        return employee;
      }),
    );

    return toEmployeeResponse(updated, true, todayIst());
  }

  async deactivate(id: string, actorId: string, access: AccessContext): Promise<EmployeeResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(id: string, actorId: string, access: AccessContext): Promise<EmployeeResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<EmployeeResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toEmployeeResponse(existing, true, todayIst());
    }

    if (isActive && !existing.company.isActive) {
      throw parentInactive('company');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: employeeInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, employee.isActive),
        entityType: 'Employee',
        entityId: id,
        companyId: employee.companyId,
        before: toEmployeeAuditSnapshot(existing),
        after: toEmployeeAuditSnapshot(employee),
      });

      return employee;
    });

    return toEmployeeResponse(updated, true, todayIst());
  }

  /** 404 when out of scope, 403 when visible but view-only. */
  private async requireManageable(
    id: string,
    access: AccessContext,
  ): Promise<EmployeeWithRelations> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });

    if (employee === null) {
      throw notFound(ENTITY);
    }

    assertManageable(access, EMPLOYEE_PERMISSIONS, { companyId: employee.companyId }, ENTITY);

    return employee;
  }

  private dataOf(fields: EmployeeInput) {
    return {
      code: fields.code,
      fullName: fields.fullName,
      designationId: fields.designationId,
      workLocationType: fields.workLocationType,
      projectId: fields.projectId,
      siteId: fields.siteId,
      dateOfJoining: toDateOnly(fields.dateOfJoining),
      dateOfLeaving: toDateOnly(fields.dateOfLeaving),
      officialEmail: fields.officialEmail,
      mobile: fields.mobile,
    };
  }

  /**
   * Inactive designation / project / site are refused only as new choices; a record keeps the ones
   * it already has (same rule as the other masters).
   */
  private async validate(
    fields: EmployeeInput,
    company: CompanyForEmployee,
    existing: EmployeeWithRelations | null,
  ): Promise<void> {
    if (
      fields.dateOfJoining !== null &&
      fields.dateOfLeaving !== null &&
      fields.dateOfLeaving < fields.dateOfJoining
    ) {
      throw invalidDates();
    }

    await this.assertWorkLocation(fields, company.id, existing);

    if (fields.designationId !== null) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: fields.designationId },
        select: { isActive: true },
      });

      if (
        designation === null ||
        (!designation.isActive && fields.designationId !== existing?.designationId)
      ) {
        throw invalidDesignation();
      }
    }

    if (
      fields.officialEmail !== null &&
      company.emailDomain !== null &&
      !emailMatchesDomain(fields.officialEmail, company.emailDomain)
    ) {
      throw invalidEmailDomain(company.emailDomain);
    }

    const sameCode = await this.prisma.employee.findFirst({
      where: {
        code: { equals: fields.code, mode: 'insensitive' },
        ...(existing === null ? {} : { id: { not: existing.id } }),
      },
      select: { employeeNo: true },
    });

    if (sameCode !== null) {
      throw duplicateEmployeeCode(sameCode.employeeNo);
    }

    if (fields.officialEmail !== null) {
      const sameEmail = await this.prisma.employee.findFirst({
        where: {
          officialEmail: { equals: fields.officialEmail, mode: 'insensitive' },
          ...(existing === null ? {} : { id: { not: existing.id } }),
        },
        select: { id: true },
      });

      if (sameEmail !== null) {
        throw duplicateEmail();
      }
    }
  }

  /** Blank or Head Office: no project/site. Project: same company, site optional of that project (OQ-138). */
  private async assertWorkLocation(
    fields: EmployeeInput,
    companyId: string,
    existing: EmployeeWithRelations | null,
  ): Promise<void> {
    const { workLocationType, projectId, siteId } = fields;

    if (workLocationType !== 'PROJECT') {
      if (projectId !== null || siteId !== null) {
        throw invalidWorkLocation();
      }

      return;
    }

    if (projectId === null) {
      throw invalidWorkLocation();
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true, isActive: true },
    });

    if (
      project === null ||
      project.companyId !== companyId ||
      (!project.isActive && projectId !== existing?.projectId)
    ) {
      throw invalidWorkLocation();
    }

    if (siteId === null) {
      return;
    }

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { projectId: true, isActive: true },
    });

    if (
      site === null ||
      site.projectId !== projectId ||
      (!site.isActive && siteId !== existing?.siteId)
    ) {
      throw invalidWorkLocation();
    }
  }
}
