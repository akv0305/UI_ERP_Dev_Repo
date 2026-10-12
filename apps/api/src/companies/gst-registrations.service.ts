import { HttpStatus, Injectable } from '@nestjs/common';
import {
  isValidGstin,
  panOfGstin,
  stateCodeOfGstin,
  type CreateGstRegistrationRequest,
  type GstRegistrationOptionsResponse,
  type GstRegistrationResponse,
  type UpdateGstRegistrationRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/errors/api-error';
import { isUniqueViolation, notFound, toDateOnly } from '../masters/master-helpers';
import { COMPANY_PERMISSIONS, PROJECT_PERMISSIONS, assertManageable } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import {
  registrationInclude,
  toRegistrationAuditSnapshot,
  toRegistrationResponse,
} from './companies.mapper';

function duplicateGstin(): ApiError {
  return new ApiError(HttpStatus.CONFLICT, 'DUPLICATE_GSTIN', 'This GSTIN is already registered');
}

@Injectable()
export class GstRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async create(
    companyId: string,
    request: CreateGstRegistrationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<GstRegistrationResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, pan: true },
    });

    if (company === null) {
      throw notFound('Company');
    }

    // Registrations belong to the company, so they follow the company's scope.
    assertManageable(access, COMPANY_PERMISSIONS, { companyId }, 'Company');

    await this.validate(request, company.pan, null, null);

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const registration = await tx.companyGstRegistration.create({
          data: {
            ...request,
            companyId,
            effectiveFrom: toDateOnly(request.effectiveFrom),
            createdById: actorId,
            updatedById: actorId,
          },
          include: registrationInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'CompanyGstRegistration',
          entityId: registration.id,
          companyId,
          before: null,
          after: toRegistrationAuditSnapshot(registration),
        });

        return registration;
      }),
    );

    return toRegistrationResponse(created);
  }

  async update(
    id: string,
    request: UpdateGstRegistrationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<GstRegistrationResponse> {
    const existing = await this.requireManageable(id, access);
    const company = await this.prisma.company.findUnique({
      where: { id: existing.companyId },
      select: { pan: true },
    });

    await this.validate(request, company?.pan ?? null, existing.id, existing.stateId);

    const updated = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const registration = await tx.companyGstRegistration.update({
          where: { id },
          data: {
            ...request,
            effectiveFrom: toDateOnly(request.effectiveFrom),
            updatedById: actorId,
          },
          include: registrationInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'CompanyGstRegistration',
          entityId: id,
          companyId: existing.companyId,
          before: toRegistrationAuditSnapshot(existing),
          after: toRegistrationAuditSnapshot(registration),
        });

        return registration;
      }),
    );

    return toRegistrationResponse(updated);
  }

  async deactivate(
    id: string,
    actorId: string,
    access: AccessContext,
  ): Promise<GstRegistrationResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(
    id: string,
    actorId: string,
    access: AccessContext,
  ): Promise<GstRegistrationResponse> {
    return this.setActive(id, true, actorId, access);
  }

  /**
   * Active registrations of one company for the project form's billing pick list. Needs only
   * masters.projects.manage over that company (not companies.view); an out-of-scope company is 404.
   */
  async optionsForProject(
    companyId: string,
    access: AccessContext,
  ): Promise<GstRegistrationOptionsResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    // Out of the user's project-manage scope reads the same as a missing company.
    if (company === null || !access.canOn(PROJECT_PERMISSIONS.manage, { companyId })) {
      throw notFound('Company');
    }

    const registrations = await this.prisma.companyGstRegistration.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ gstin: 'asc' }],
      select: { id: true, gstin: true },
    });

    return { items: registrations.map((row) => ({ id: row.id, label: row.gstin })) };
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<GstRegistrationResponse> {
    const existing = await this.requireManageable(id, access);

    if (existing.isActive === isActive) {
      return toRegistrationResponse(existing);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const registration = await tx.companyGstRegistration.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: registrationInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, registration.isActive),
        entityType: 'CompanyGstRegistration',
        entityId: id,
        companyId: existing.companyId,
        before: toRegistrationAuditSnapshot(existing),
        after: toRegistrationAuditSnapshot(registration),
      });

      return registration;
    });

    return toRegistrationResponse(updated);
  }

  /** Format and check digit, state, company PAN and uniqueness, in that order. */
  private async validate(
    request: CreateGstRegistrationRequest,
    companyPan: string | null,
    excludeId: string | null,
    currentStateId: string | null,
  ): Promise<void> {
    if (!isValidGstin(request.gstin)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_GSTIN', 'The GSTIN is not valid');
    }

    const state = await this.states.assertUsable(request.stateId, currentStateId);

    if (stateCodeOfGstin(request.gstin) !== state.gstCode) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'GSTIN_STATE_MISMATCH',
        'The GSTIN does not belong to the selected state',
      );
    }

    if (companyPan !== null && panOfGstin(request.gstin) !== companyPan) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'GSTIN_PAN_MISMATCH',
        'The GSTIN does not match the company PAN',
      );
    }

    const same = await this.prisma.companyGstRegistration.findFirst({
      where: { gstin: request.gstin, ...(excludeId === null ? {} : { id: { not: excludeId } }) },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateGstin();
    }
  }

  /** The registration, once the user is known to manage its company (404 out of scope, 403 view-only). */
  private async requireManageable(id: string, access: AccessContext) {
    const registration = await this.requireRegistration(id);

    assertManageable(
      access,
      COMPANY_PERMISSIONS,
      { companyId: registration.companyId },
      'GST registration',
    );

    return registration;
  }

  private async requireRegistration(id: string) {
    const registration = await this.prisma.companyGstRegistration.findUnique({
      where: { id },
      include: registrationInclude,
    });

    if (registration === null) {
      throw notFound('GST registration');
    }

    return registration;
  }

  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw isUniqueViolation(error) ? duplicateGstin() : error;
    }
  }
}
