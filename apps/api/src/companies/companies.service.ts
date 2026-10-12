import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  panOfGstin,
  type CompanyDetailResponse,
  type CompanyListQuery,
  type CompanyResponse,
  type CreateCompanyRequest,
  type PagedCompaniesResponse,
  type UpdateCompanyRequest,
} from '@uie/contracts';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/errors/api-error';
import { hasActiveChildren } from '../masters/hierarchy-errors';
import {
  assertCodeUnchanged,
  duplicateCode,
  isUniqueViolation,
  notFound,
  pageOf,
} from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import {
  companyDetailInclude,
  companyInclude,
  toCompanyAuditSnapshot,
  toCompanyDetailResponse,
  toCompanyResponse,
} from './companies.mapper';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CompanyListQuery): Promise<PagedCompaniesResponse> {
    const where: Prisma.CompanyWhereInput = {};

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

    return pageOf(companies.map(toCompanyResponse), total, query);
  }

  async get(id: string): Promise<CompanyDetailResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyDetailInclude,
    });

    if (company === null) {
      throw notFound('Company');
    }

    return toCompanyDetailResponse(company);
  }

  async create(request: CreateCompanyRequest, actorId: string): Promise<CompanyResponse> {
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

    return toCompanyResponse(created);
  }

  async update(
    id: string,
    request: UpdateCompanyRequest,
    actorId: string,
  ): Promise<CompanyResponse> {
    const existing = await this.requireCompany(id);

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

    return toCompanyResponse(updated);
  }

  async deactivate(id: string, actorId: string): Promise<CompanyResponse> {
    return this.setActive(id, false, actorId);
  }

  async reactivate(id: string, actorId: string): Promise<CompanyResponse> {
    return this.setActive(id, true, actorId);
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
  ): Promise<CompanyResponse> {
    const existing = await this.requireCompany(id);

    if (existing.isActive === isActive) {
      return toCompanyResponse(existing);
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

    return toCompanyResponse(updated);
  }

  private async requireCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyInclude,
    });

    if (company === null) {
      throw notFound('Company');
    }

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
