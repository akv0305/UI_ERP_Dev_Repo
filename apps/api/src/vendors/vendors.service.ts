import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  panOfGstin,
  type ApproveVendorRequest,
  type CreateVendorRequest,
  type PagedVendorsResponse,
  type RejectVendorRequest,
  type ReopenVendorRequest,
  type UpdateVendorRequest,
  type VendorDetailResponse,
  type VendorListQuery,
  type VendorResponse,
  type VendorStatus,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { VENDOR_SERIES, lockSeries, nextCode } from '../masters/code-series';
import { notFound, pageOf } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import {
  EDITABLE_VENDOR_STATUSES,
  assertCanApproveVendors,
  assertCanManageVendors,
  assertCanViewVendors,
  vendorFlagsFor,
} from './vendor-access';
import {
  duplicatePan,
  duplicateUdyam,
  invalidVendorStatus,
  selfApprovalNotAllowed,
  vendorPanMismatch,
  vendorUniqueConflictOf,
} from './vendor-errors';
import {
  amountText,
  normalizeAmount,
  toVendorAuditSnapshot,
  toVendorDetailResponse,
  toVendorResponse,
  vendorDetailInclude,
  vendorInclude,
  type VendorWithRelations,
} from './vendors.mapper';

const ENTITY = 'Vendor';
const CHANGED_BY_SOMEONE_ELSE = 'This vendor was changed by someone else. Reload and try again.';

type Tx = Prisma.TransactionClient;

function fieldsOf(request: CreateVendorRequest) {
  return {
    legalName: request.legalName,
    tradeName: request.tradeName,
    vendorType: request.vendorType,
    pan: request.pan,
    udyamNumber: request.udyamNumber,
    msmeCategory: request.msmeCategory,
    addressLine1: request.addressLine1,
    addressLine2: request.addressLine2,
    city: request.city,
    stateId: request.stateId,
    pinCode: request.pinCode,
    paymentTermsDays: request.paymentTermsDays,
    creditLimit: request.creditLimit,
    remarks: request.remarks,
  };
}

function sameFields(vendor: VendorWithRelations, request: UpdateVendorRequest): boolean {
  return (
    vendor.legalName === request.legalName &&
    vendor.tradeName === request.tradeName &&
    vendor.vendorType === request.vendorType &&
    vendor.pan === request.pan &&
    vendor.udyamNumber === request.udyamNumber &&
    vendor.msmeCategory === request.msmeCategory &&
    vendor.addressLine1 === request.addressLine1 &&
    vendor.addressLine2 === request.addressLine2 &&
    vendor.city === request.city &&
    vendor.stateId === request.stateId &&
    vendor.pinCode === request.pinCode &&
    vendor.paymentTermsDays === request.paymentTermsDays &&
    amountText(vendor.creditLimit) === normalizeAmount(request.creditLimit) &&
    vendor.remarks === request.remarks
  );
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: VendorListQuery,
    actorId: string,
    access: AccessContext,
  ): Promise<PagedVendorsResponse> {
    assertCanViewVendors(access);

    const where: Prisma.VendorWhereInput = {};

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { legalName: { contains: query.search, mode: 'insensitive' } },
        { tradeName: { contains: query.search, mode: 'insensitive' } },
        { pan: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.vendorType !== undefined) {
      where.vendorType = query.vendorType;
    }

    if (query.status !== undefined) {
      where.status = query.status;
    }

    if (query.stateId !== undefined) {
      where.stateId = query.stateId;
    }

    const [total, vendors] = await Promise.all([
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where,
        include: vendorInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      vendors.map((vendor) => toVendorResponse(vendor, vendorFlagsFor(access, vendor, actorId))),
      total,
      query,
    );
  }

  /** The vendor with its GST registrations, bank accounts (masked for non-managers) and contacts. */
  async get(id: string, actorId: string, access: AccessContext): Promise<VendorDetailResponse> {
    assertCanViewVendors(access);

    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: vendorDetailInclude,
    });

    if (vendor === null) {
      throw notFound(ENTITY);
    }

    return toVendorDetailResponse(vendor, vendorFlagsFor(access, vendor, actorId));
  }

  async create(
    request: CreateVendorRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorResponse> {
    assertCanManageVendors(access);

    if (request.stateId !== null) {
      await this.states.assertUsable(request.stateId);
    }

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const code = await nextCode(tx, VENDOR_SERIES);

        await this.assertUnique(tx, request);

        const vendor = await tx.vendor.create({
          data: { code, ...fieldsOf(request), createdById: actorId, updatedById: actorId },
          include: vendorInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'Vendor',
          entityId: vendor.id,
          before: null,
          after: toVendorAuditSnapshot(vendor),
        });

        return vendor;
      }),
    );

    return toVendorResponse(created, vendorFlagsFor(access, created, actorId));
  }

  /** Only Draft or Rejected vendors can be edited; Approved vendors are locked until reopened. */
  async update(
    id: string,
    request: UpdateVendorRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorResponse> {
    assertCanManageVendors(access);

    const existing = await this.find(id);

    this.assertEditable(existing);

    if (sameFields(existing, request)) {
      return toVendorResponse(existing, vendorFlagsFor(access, existing, actorId));
    }

    if (request.stateId !== null && request.stateId !== existing.stateId) {
      await this.states.assertUsable(request.stateId);
    }

    if (request.pan !== null && request.pan !== existing.pan) {
      await this.assertPanMatchesGst(id, request.pan);
    }

    const updated = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        await lockSeries(tx, VENDOR_SERIES);
        await this.assertUnique(tx, request, id);

        const result = await tx.vendor.updateMany({
          where: { id, isActive: true, status: { in: [...EDITABLE_VENDOR_STATUSES] } },
          data: { ...fieldsOf(request), updatedById: actorId },
        });

        if (result.count === 0) {
          throw invalidVendorStatus(CHANGED_BY_SOMEONE_ELSE);
        }

        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id }, include: vendorInclude });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'UPDATE',
          entityType: 'Vendor',
          entityId: id,
          before: toVendorAuditSnapshot(existing),
          after: toVendorAuditSnapshot(vendor),
        });

        return vendor;
      }),
    );

    return toVendorResponse(updated, vendorFlagsFor(access, updated, actorId));
  }

  async submit(id: string, actorId: string, access: AccessContext): Promise<VendorResponse> {
    assertCanManageVendors(access);

    return this.transition(id, EDITABLE_VENDOR_STATUSES, false, actorId, access, {
      status: 'PENDING_APPROVAL',
      submittedAt: new Date(),
      submittedById: actorId,
      decidedAt: null,
      decidedById: null,
      decisionRemarks: null,
    });
  }

  /** Maker-checker (OQ-35 b): the submitter cannot approve their own vendor. */
  async approve(
    id: string,
    request: ApproveVendorRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorResponse> {
    assertCanApproveVendors(access);

    return this.transition(id, ['PENDING_APPROVAL'], true, actorId, access, {
      status: 'APPROVED',
      decidedAt: new Date(),
      decidedById: actorId,
      decisionRemarks: request.remarks,
    });
  }

  /** The submitter cannot reject their own vendor either (OQ-36). */
  async reject(
    id: string,
    request: RejectVendorRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorResponse> {
    assertCanApproveVendors(access);

    return this.transition(id, ['PENDING_APPROVAL'], true, actorId, access, {
      status: 'REJECTED',
      decidedAt: new Date(),
      decidedById: actorId,
      decisionRemarks: request.remarks,
    });
  }

  /** Approved -> Draft so the maker can edit; not usable in new documents until re-approved. */
  async reopen(
    id: string,
    request: ReopenVendorRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorResponse> {
    assertCanApproveVendors(access);

    return this.transition(id, ['APPROVED'], false, actorId, access, {
      status: 'DRAFT',
      submittedAt: null,
      submittedById: null,
      decidedAt: new Date(),
      decidedById: actorId,
      decisionRemarks: request.remarks,
    });
  }

  async deactivate(id: string, actorId: string, access: AccessContext): Promise<VendorResponse> {
    return this.setActive(id, false, actorId, access);
  }

  async reactivate(id: string, actorId: string, access: AccessContext): Promise<VendorResponse> {
    return this.setActive(id, true, actorId, access);
  }

  private async transition(
    id: string,
    from: readonly VendorStatus[],
    makerChecker: boolean,
    actorId: string,
    access: AccessContext,
    data: Prisma.VendorUncheckedUpdateManyInput,
  ): Promise<VendorResponse> {
    const existing = await this.find(id);

    if (!existing.isActive || !from.includes(existing.status)) {
      throw invalidVendorStatus('This action is not allowed in the vendors current status');
    }

    if (makerChecker && existing.submittedById === actorId) {
      throw selfApprovalNotAllowed();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vendor.updateMany({
        where: { id, isActive: true, status: { in: [...from] } },
        data: { ...data, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidVendorStatus(CHANGED_BY_SOMEONE_ELSE);
      }

      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id }, include: vendorInclude });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'Vendor',
        entityId: id,
        before: toVendorAuditSnapshot(existing),
        after: toVendorAuditSnapshot(vendor),
      });

      return vendor;
    });

    return toVendorResponse(updated, vendorFlagsFor(access, updated, actorId));
  }

  private async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorResponse> {
    assertCanManageVendors(access);

    const existing = await this.find(id);

    if (existing.isActive === isActive) {
      return toVendorResponse(existing, vendorFlagsFor(access, existing, actorId));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: vendorInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: auditActionFor(existing.isActive, vendor.isActive),
        entityType: 'Vendor',
        entityId: id,
        before: toVendorAuditSnapshot(existing),
        after: toVendorAuditSnapshot(vendor),
      });

      return vendor;
    });

    return toVendorResponse(updated, vendorFlagsFor(access, updated, actorId));
  }

  private async find(id: string): Promise<VendorWithRelations> {
    const vendor = await this.prisma.vendor.findUnique({ where: { id }, include: vendorInclude });

    if (vendor === null) {
      throw notFound(ENTITY);
    }

    return vendor;
  }

  private assertEditable(vendor: VendorWithRelations): void {
    if (!vendor.isActive) {
      throw invalidVendorStatus('Reactivate this vendor before editing it');
    }

    if (vendor.status === 'APPROVED') {
      throw invalidVendorStatus(
        'Approved vendors are locked. Ask the approver to reopen it for editing.',
      );
    }

    if (vendor.status === 'PENDING_APPROVAL') {
      throw invalidVendorStatus('This vendor is waiting for approval and cannot be edited');
    }
  }

  /** Characters 3-12 of every GSTIN of the vendor must equal the new PAN. */
  private async assertPanMatchesGst(vendorId: string, pan: string): Promise<void> {
    const rows = await this.prisma.vendorGstRegistration.findMany({
      where: { vendorId },
      select: { gstin: true },
    });

    if (rows.some((row) => panOfGstin(row.gstin) !== pan)) {
      throw vendorPanMismatch();
    }
  }

  /** PAN and Udyam unique among all vendors, active or not (OQ-35 c). Runs under the series lock. */
  private async assertUnique(
    tx: Tx,
    request: CreateVendorRequest,
    exceptId?: string,
  ): Promise<void> {
    const except = exceptId === undefined ? {} : { id: { not: exceptId } };

    if (request.pan !== null) {
      const same = await tx.vendor.findFirst({
        where: { pan: request.pan, ...except },
        select: { code: true },
      });

      if (same !== null) {
        throw duplicatePan(same.code);
      }
    }

    if (request.udyamNumber !== null) {
      const same = await tx.vendor.findFirst({
        where: { udyamNumber: request.udyamNumber, ...except },
        select: { code: true },
      });

      if (same !== null) {
        throw duplicateUdyam(same.code);
      }
    }
  }

  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw vendorUniqueConflictOf(error) ?? error;
    }
  }
}
