import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  panOfGstin,
  type CompanyDetailResponse,
  type CompanyListQuery,
  type CompanyOptionsResponse,
  type CompanyResponse,
  type CreateCompanyRequest,
  type PagedCompaniesResponse,
  type UpdateCompanyRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { codeLabel } from '../auth/auth.mapper';
import { ApiError } from '../common/errors/api-error';
import { hasActiveChildren } from '../masters/hierarchy-errors';
import {
  assertCodeUnchanged,
  duplicateCode,
  isUniqueViolation,
  notFound,
  pageOf,
} from '../masters/master-helpers';
import {
  COMPANY_PERMISSIONS,
  assertManageable,
  assertVisible,
  canManage,
  forbidden,
  idFilter,
} from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import {
  companyDetailInclude,
  companyInclude,
  toCompanyAuditSnapshot,
  toCompanyDetailResponse,
  toCompanyResponse,
} from './companies.mapper';

const ENTITY = 'Company';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CompanyListQuery, access: AccessContext): Promise<PagedCompaniesResponse> {
    // Companies the user can see: a GLOBAL holder sees all, otherwise the companies they cover.
    // A project/site-scoped user does not see the parent company row through this list.
    const visible = await access.accessibleCompanyIds([
      COMPANY_PERMISSIONS.view,
      COMPANY_PERMISSIONS.manage,
    ]);
    const where: Prisma.CompanyWhereInput = { id: idFilter(visible) };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { legalName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.entityType !== undefined) {
      where.entityType = query.entityType;
    }

    const [total, companies] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        include: companyInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      companies.map((company) =>
        toCompanyResponse(
          company,
          canManage(access, COMPANY_PERMISSIONS, { companyId: company.id }),
        ),
      ),
      total,
      query,
    );
  }

  /**
   * Active companies the user may create a project under: those covered by a
   * masters.projects.manage assignment. Needs only that permission, not companies.view.
   */
  async optionsForProjects(access: AccessContext): Promise<CompanyOptionsResponse> {
    const covered = await access.accessibleCompanyIds('masters.projects.manage');
    const companies = await this.prisma.company.findMany({
      where: { isActive: true, id: idFilter(covered) },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, legalName: true },
    });

    return {
      items: companies.map((company) => ({
        id: company.id,
        label: codeLabel(company.code, company.legalName),
      })),
    };
  }

  async get(id: string, access: AccessContext): Promise<CompanyDetailResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyDetailInclude,
    });

    if (company === null) {
      throw notFound(ENTITY);
    }

    assertVisible(access, COMPANY_PERMISSIONS, { companyId: id }, ENTITY);

    return toCompanyDetailResponse(
      company,
      canManage(access, COMPANY_PERMISSIONS, { companyId: id }),
    );
  }

  async create(
    request: CreateCompanyRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<CompanyResponse> {
    // A new company has no parent: only a GLOBAL holder of masters.companies.manage may create one.
    if (!(await access.can(COMPANY_PERMISSIONS.manage, { global: true }))) {
      throw forbidden();
    }

    await this.assertCodeFree(request.code);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId);
    }

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: { ...request, createdById: actorId, updatedById: actorId },
          include: companyInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Company',
          entityId: company.id,
          companyId: company.id,
          before: null,
          after: toCompanyAuditSnapshot(company),
        });

        return company;
      }),
    );

    return toCompanyResponse(created, true);
  }

  async update(
    id: string,
    request: UpdateCompanyRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<CompanyResponse> {
    const existing = await this.requireManageable(id, access);

    assertCodeUnchanged(request.code, existing.code);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId, existing.stateId);
    }

    await this.assertRegistrationsMatchPan(id, request.pan);

    const { code: _code, ...fields } = request;
    const updated = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id },
        data: { ...fields, updatedById: actorId },
        include: companyInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Company',
        entityId: id,
        companyId: id,
        before: toCompanyAuditSnapshot(existing),
        after: toCompanyAuditSnapshot(company),
      });

      return company;
    });

    return toCompanyResponse(updated, true);
  }

  async deactivate(id: string, actorId: string, access: AccessContext): Promise<CompanyResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(id: string, actorId: string, access: AccessContext): Promise<CompanyResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<CompanyResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toCompanyResponse(existing, true);
    }

    if (!isActive) {
      const activeProjects = await this.prisma.project.count({
        where: { companyId: id, isActive: true },
      });

      if (activeProjects > 0) {
        throw hasActiveChildren('projects');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: companyInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, company.isActive),
        entityType: 'Company',
        entityId: id,
        companyId: id,
        before: toCompanyAuditSnapshot(existing),
        after: toCompanyAuditSnapshot(company),
      });

      return company;
    });

    return toCompanyResponse(updated, true);
  }

  /** The record, once the user is known to be allowed to change it (404 out of scope, 403 view-only). */
  private async requireManageable(id: string, access: AccessContext) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyInclude,
    });

    if (company === null) {
      throw notFound(ENTITY);
    }

    assertManageable(access, COMPANY_PERMISSIONS, { companyId: id }, ENTITY);

    return company;
  }

  private async assertCodeFree(code: string): Promise<void> {
    const same = await this.prisma.company.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateCode();
    }
  }

  /** Changing the PAN must not leave an existing GSTIN whose characters 3-12 differ from it. */
  private async assertRegistrationsMatchPan(companyId: string, pan: string | null): Promise<void> {
    if (pan === null) {
      return;
    }

    const registrations = await this.prisma.companyGstRegistration.findMany({
      where: { companyId },
      select: { gstin: true },
    });

    if (registrations.some((registration) => panOfGstin(registration.gstin) !== pan)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'GSTIN_PAN_MISMATCH',
        'An existing GST registration does not match this PAN',
      );
    }
  }

  /** A concurrent insert can still hit the unique index; report it as DUPLICATE_CODE. */
  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw isUniqueViolation(error) ? duplicateCode() : error;
    }
  }
}
