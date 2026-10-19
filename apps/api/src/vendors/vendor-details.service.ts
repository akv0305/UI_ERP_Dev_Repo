import { Injectable } from '@nestjs/common';
import type { Prisma, VendorBankAccount, VendorContact } from '@prisma/client';
import {
  isValidGstin,
  panOfGstin,
  stateCodeOfGstin,
  type AuditAction,
  type AuditEntityType,
  type CreateVendorBankAccountRequest,
  type CreateVendorContactRequest,
  type CreateVendorGstRegistrationRequest,
  type VendorBankAccountResponse,
  type VendorContactResponse,
  type VendorGstRegistrationResponse,
  type VendorStatus,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { auditActionFor } from '../audit/audit-action';
import { AuditService } from '../audit/audit.service';
import { notFound, sameSnapshot, toDateOnly } from '../masters/master-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { EDITABLE_VENDOR_STATUSES, assertCanManageVendors } from './vendor-access';
import {
  duplicateBankAccount,
  duplicateVendorGstin,
  gstinStateMismatch,
  gstinVendorPanMismatch,
  invalidGstin,
  invalidVendorStatus,
  vendorDetailConflictOf,
} from './vendor-errors';
import {
  toVendorBankAccountResponse,
  toVendorBankAuditSnapshot,
  toVendorContactAuditSnapshot,
  toVendorContactResponse,
  toVendorGstAuditSnapshot,
  toVendorGstResponse,
  vendorGstInclude,
} from './vendors.mapper';

const LOCKED_DETAILS =
  'GST registrations and bank accounts can change only while the vendor is Draft or Rejected. Ask the approver to reopen it.';

type Tx = Prisma.TransactionClient;
type Snapshot = Record<string, unknown>;

interface LockedVendor {
  id: string;
  status: VendorStatus;
  isActive: boolean;
  pan: string | null;
}

function notId(id: string | null) {
  return id === null ? {} : { id: { not: id } };
}

/** Row lock on the vendor until the transaction ends, so submit/approve cannot interleave. */
async function lockVendor(tx: Tx, vendorId: string): Promise<LockedVendor> {
  const rows = await tx.$queryRaw<LockedVendor[]>`
    SELECT "id", "status"::text AS "status", "isActive", "pan"
    FROM "vendors" WHERE "id" = ${vendorId}::uuid FOR UPDATE`;
  const vendor = rows[0];

  if (vendor === undefined) {
    throw notFound('Vendor');
  }

  return vendor;
}

function assertVendorActive(vendor: LockedVendor): void {
  if (!vendor.isActive) {
    throw invalidVendorStatus('Reactivate this vendor before changing it');
  }
}

/** GST and bank rows are part of what the approver approved (OQ-35 d). */
function assertDetailsEditable(vendor: LockedVendor): void {
  assertVendorActive(vendor);

  if (!EDITABLE_VENDOR_STATUSES.includes(vendor.status)) {
    throw invalidVendorStatus(LOCKED_DETAILS);
  }
}

@Injectable()
export class VendorDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: StatesService,
    private readonly audit: AuditService,
  ) {}

  // ---------- GST registrations ----------

  async createGst(
    vendorId: string,
    request: CreateVendorGstRegistrationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorGstRegistrationResponse> {
    assertCanManageVendors(access);

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const vendor = await lockVendor(tx, vendorId);

        assertDetailsEditable(vendor);
        await this.validateGst(tx, request, vendor.pan, null, null);

        const row = await tx.vendorGstRegistration.create({
          data: {
            ...request,
            vendorId,
            effectiveFrom: toDateOnly(request.effectiveFrom),
            createdById: actorId,
            updatedById: actorId,
          },
          include: vendorGstInclude,
        });

        await this.record(
          tx,
          actorId,
          'VendorGstRegistration',
          row.id,
          'CREATE',
          null,
          toVendorGstAuditSnapshot(row),
        );

        return row;
      }),
    );

    return toVendorGstResponse(created);
  }

  async updateGst(
    id: string,
    request: CreateVendorGstRegistrationRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorGstRegistrationResponse> {
    assertCanManageVendors(access);

    const { vendorId } = await this.findGst(id);

    const updated = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const vendor = await lockVendor(tx, vendorId);

        assertDetailsEditable(vendor);

        const existing = await tx.vendorGstRegistration.findUniqueOrThrow({
          where: { id },
          include: vendorGstInclude,
        });

        await this.validateGst(tx, request, vendor.pan, id, existing.stateId);

        const row = await tx.vendorGstRegistration.update({
          where: { id },
          data: {
            ...request,
            effectiveFrom: toDateOnly(request.effectiveFrom),
            updatedById: actorId,
          },
          include: vendorGstInclude,
        });
        const before = toVendorGstAuditSnapshot(existing);
        const after = toVendorGstAuditSnapshot(row);

        if (!sameSnapshot(before, after)) {
          await this.record(tx, actorId, 'VendorGstRegistration', id, 'UPDATE', before, after);
        }

        return row;
      }),
    );

    return toVendorGstResponse(updated);
  }

  async setGstActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorGstRegistrationResponse> {
    assertCanManageVendors(access);

    const { vendorId } = await this.findGst(id);

    const row = await this.prisma.$transaction(async (tx) => {
      assertDetailsEditable(await lockVendor(tx, vendorId));

      const existing = await tx.vendorGstRegistration.findUniqueOrThrow({
        where: { id },
        include: vendorGstInclude,
      });

      if (existing.isActive === isActive) {
        return existing;
      }

      const updated = await tx.vendorGstRegistration.update({
        where: { id },
        data: { isActive, updatedById: actorId },
        include: vendorGstInclude,
      });

      await this.record(
        tx,
        actorId,
        'VendorGstRegistration',
        id,
        auditActionFor(existing.isActive, updated.isActive),
        toVendorGstAuditSnapshot(existing),
        toVendorGstAuditSnapshot(updated),
      );

      return updated;
    });

    return toVendorGstResponse(row);
  }

  // ---------- Bank accounts ----------

  async createBank(
    vendorId: string,
    request: CreateVendorBankAccountRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorBankAccountResponse> {
    assertCanManageVendors(access);

    const created = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        assertDetailsEditable(await lockVendor(tx, vendorId));
        await this.assertBankFree(tx, vendorId, request, null);

        if (request.isPrimary) {
          await this.demoteBankPrimary(tx, vendorId, actorId, null);
        }

        const row = await tx.vendorBankAccount.create({
          data: { ...request, vendorId, createdById: actorId, updatedById: actorId },
        });

        await this.record(
          tx,
          actorId,
          'VendorBankAccount',
          row.id,
          'CREATE',
          null,
          toVendorBankAuditSnapshot(row),
        );

        return row;
      }),
    );

    return toVendorBankAccountResponse(created, true);
  }

  async updateBank(
    id: string,
    request: CreateVendorBankAccountRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorBankAccountResponse> {
    assertCanManageVendors(access);

    const { vendorId } = await this.findBank(id);

    const updated = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        assertDetailsEditable(await lockVendor(tx, vendorId));

        const existing = await tx.vendorBankAccount.findUniqueOrThrow({ where: { id } });

        if (!existing.isActive) {
          throw invalidVendorStatus('Reactivate this bank account before editing it');
        }

        await this.assertBankFree(tx, vendorId, request, id);

        if (request.isPrimary && !existing.isPrimary) {
          await this.demoteBankPrimary(tx, vendorId, actorId, id);
        }

        const row = await tx.vendorBankAccount.update({
          where: { id },
          data: { ...request, updatedById: actorId },
        });
        const before = toVendorBankAuditSnapshot(existing);
        const after = toVendorBankAuditSnapshot(row);

        // The snapshot is masked, so compare the full number too.
        if (existing.accountNumber !== row.accountNumber || !sameSnapshot(before, after)) {
          await this.record(tx, actorId, 'VendorBankAccount', id, 'UPDATE', before, after);
        }

        return row;
      }),
    );

    return toVendorBankAccountResponse(updated, true);
  }

  /** A deactivated account is never primary (CHECK in the migration). */
  async setBankActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorBankAccountResponse> {
    assertCanManageVendors(access);

    const { vendorId } = await this.findBank(id);

    const row = await this.guardUnique(() =>
      this.prisma.$transaction(async (tx) => {
        assertDetailsEditable(await lockVendor(tx, vendorId));

        const existing = await tx.vendorBankAccount.findUniqueOrThrow({ where: { id } });

        if (existing.isActive === isActive) {
          return existing;
        }

        const updated = await tx.vendorBankAccount.update({
          where: { id },
          data: { isActive, isPrimary: isActive && existing.isPrimary, updatedById: actorId },
        });

        await this.record(
          tx,
          actorId,
          'VendorBankAccount',
          id,
          auditActionFor(existing.isActive, updated.isActive),
          toVendorBankAuditSnapshot(existing),
          toVendorBankAuditSnapshot(updated),
        );

        return updated;
      }),
    );

    return toVendorBankAccountResponse(row, true);
  }

  // ---------- Contacts (editable at any status, OQ-35 d) ----------

  async createContact(
    vendorId: string,
    request: CreateVendorContactRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorContactResponse> {
    assertCanManageVendors(access);

    const created = await this.prisma.$transaction(async (tx) => {
      assertVendorActive(await lockVendor(tx, vendorId));

      if (request.isPrimary) {
        await this.demoteContactPrimary(tx, vendorId, actorId, null);
      }

      const row = await tx.vendorContact.create({
        data: { ...request, vendorId, createdById: actorId, updatedById: actorId },
      });

      await this.record(
        tx,
        actorId,
        'VendorContact',
        row.id,
        'CREATE',
        null,
        toVendorContactAuditSnapshot(row),
      );

      return row;
    });

    return toVendorContactResponse(created);
  }

  async updateContact(
    id: string,
    request: CreateVendorContactRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorContactResponse> {
    assertCanManageVendors(access);

    const { vendorId } = await this.findContact(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      assertVendorActive(await lockVendor(tx, vendorId));

      const existing = await tx.vendorContact.findUniqueOrThrow({ where: { id } });

      if (!existing.isActive) {
        throw invalidVendorStatus('Reactivate this contact before editing it');
      }

      if (request.isPrimary && !existing.isPrimary) {
        await this.demoteContactPrimary(tx, vendorId, actorId, id);
      }

      const row = await tx.vendorContact.update({
        where: { id },
        data: { ...request, updatedById: actorId },
      });
      const before = toVendorContactAuditSnapshot(existing);
      const after = toVendorContactAuditSnapshot(row);

      if (!sameSnapshot(before, after)) {
        await this.record(tx, actorId, 'VendorContact', id, 'UPDATE', before, after);
      }

      return row;
    });

    return toVendorContactResponse(updated);
  }

  async setContactActive(
    id: string,
    isActive: boolean,
    actorId: string,
    access: AccessContext,
  ): Promise<VendorContactResponse> {
    assertCanManageVendors(access);

    const { vendorId } = await this.findContact(id);

    const row = await this.prisma.$transaction(async (tx) => {
      assertVendorActive(await lockVendor(tx, vendorId));

      const existing = await tx.vendorContact.findUniqueOrThrow({ where: { id } });

      if (existing.isActive === isActive) {
        return existing;
      }

      const updated = await tx.vendorContact.update({
        where: { id },
        data: { isActive, isPrimary: isActive && existing.isPrimary, updatedById: actorId },
      });

      await this.record(
        tx,
        actorId,
        'VendorContact',
        id,
        auditActionFor(existing.isActive, updated.isActive),
        toVendorContactAuditSnapshot(existing),
        toVendorContactAuditSnapshot(updated),
      );

      return updated;
    });

    return toVendorContactResponse(row);
  }

  // ---------- Helpers ----------

  /** Format and check digit, state, vendor PAN and uniqueness, in that order (as companies). */
  private async validateGst(
    tx: Tx,
    request: CreateVendorGstRegistrationRequest,
    vendorPan: string | null,
    excludeId: string | null,
    currentStateId: string | null,
  ): Promise<void> {
    if (!isValidGstin(request.gstin)) {
      throw invalidGstin();
    }

    const state = await this.states.assertUsable(request.stateId, currentStateId);

    if (stateCodeOfGstin(request.gstin) !== state.gstCode) {
      throw gstinStateMismatch();
    }

    if (vendorPan !== null && panOfGstin(request.gstin) !== vendorPan) {
      throw gstinVendorPanMismatch();
    }

    const same = await tx.vendorGstRegistration.findFirst({
      where: { gstin: request.gstin, ...notId(excludeId) },
      select: { vendor: { select: { code: true } } },
    });

    if (same !== null) {
      throw duplicateVendorGstin(same.vendor.code);
    }
  }

  private async assertBankFree(
    tx: Tx,
    vendorId: string,
    request: CreateVendorBankAccountRequest,
    exceptId: string | null,
  ): Promise<void> {
    const same = await tx.vendorBankAccount.findFirst({
      where: {
        vendorId,
        ifsc: request.ifsc,
        accountNumber: request.accountNumber,
        ...notId(exceptId),
      },
      select: { id: true },
    });

    if (same !== null) {
      throw duplicateBankAccount();
    }
  }

  /** Takes primary off the vendor's other accounts (audited), before a new primary is written. */
  private async demoteBankPrimary(
    tx: Tx,
    vendorId: string,
    actorId: string,
    exceptId: string | null,
  ): Promise<void> {
    const current: VendorBankAccount[] = await tx.vendorBankAccount.findMany({
      where: { vendorId, isPrimary: true, ...notId(exceptId) },
    });

    for (const row of current) {
      const updated = await tx.vendorBankAccount.update({
        where: { id: row.id },
        data: { isPrimary: false, updatedById: actorId },
      });

      await this.record(
        tx,
        actorId,
        'VendorBankAccount',
        row.id,
        'UPDATE',
        toVendorBankAuditSnapshot(row),
        toVendorBankAuditSnapshot(updated),
      );
    }
  }

  private async demoteContactPrimary(
    tx: Tx,
    vendorId: string,
    actorId: string,
    exceptId: string | null,
  ): Promise<void> {
    const current: VendorContact[] = await tx.vendorContact.findMany({
      where: { vendorId, isPrimary: true, ...notId(exceptId) },
    });

    for (const row of current) {
      const updated = await tx.vendorContact.update({
        where: { id: row.id },
        data: { isPrimary: false, updatedById: actorId },
      });

      await this.record(
        tx,
        actorId,
        'VendorContact',
        row.id,
        'UPDATE',
        toVendorContactAuditSnapshot(row),
        toVendorContactAuditSnapshot(updated),
      );
    }
  }

  private async record(
    tx: Tx,
    actorId: string,
    entityType: AuditEntityType,
    entityId: string,
    action: AuditAction,
    before: Snapshot | null,
    after: Snapshot,
  ): Promise<void> {
    await this.audit.record(tx, {
      actorUserId: actorId,
      action,
      entityType,
      entityId,
      before,
      after,
    });
  }

  private async findGst(id: string): Promise<{ vendorId: string }> {
    const row = await this.prisma.vendorGstRegistration.findUnique({
      where: { id },
      select: { vendorId: true },
    });

    if (row === null) {
      throw notFound('GST registration');
    }

    return row;
  }

  private async findBank(id: string): Promise<{ vendorId: string }> {
    const row = await this.prisma.vendorBankAccount.findUnique({
      where: { id },
      select: { vendorId: true },
    });

    if (row === null) {
      throw notFound('Bank account');
    }

    return row;
  }

  private async findContact(id: string): Promise<{ vendorId: string }> {
    const row = await this.prisma.vendorContact.findUnique({
      where: { id },
      select: { vendorId: true },
    });

    if (row === null) {
      throw notFound('Contact');
    }

    return row;
  }

  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw vendorDetailConflictOf(error) ?? error;
    }
  }
}
