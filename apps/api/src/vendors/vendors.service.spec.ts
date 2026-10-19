import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, scopedAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { VendorsService } from './vendors.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VENDOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMPANY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function vendorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VENDOR_ID,
    code: 'VEN-0042',
    legalName: 'Sri Balaji Traders',
    tradeName: null,
    vendorType: 'SUPPLIER',
    pan: null,
    udyamNumber: null,
    msmeCategory: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateId: null,
    state: null,
    pinCode: null,
    paymentTermsDays: null,
    creditLimit: null,
    remarks: null,
    status: 'DRAFT',
    submittedAt: null,
    submittedById: null,
    submittedBy: null,
    decidedAt: null,
    decidedById: null,
    decidedBy: null,
    decisionRemarks: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function setup(lastNumber: number | null = 41) {
  const state = { after: vendorRow() as unknown };
  const recorder = new TransactionRecorder();
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ last: lastNumber }]),
    vendor: {
      findFirst: jest.fn(async () => null as unknown),
      create: recorder.write('vendor.create', () => vendorRow()),
      update: recorder.write('vendor.update', () => state.after),
      updateMany: recorder.write('vendor.updateMany', () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => state.after),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    vendor: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    vendorGstRegistration: { findMany: jest.fn() },
    state: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.vendor.findUnique.mockResolvedValue(vendorRow());
  prisma.vendorGstRegistration.findMany.mockResolvedValue([]);

  const client = prisma as unknown as PrismaService;
  const service = new VendorsService(client, new StatesService(client), new AuditService());

  return { prisma, tx, recorder, service, state };
}

const createRequest = {
  legalName: 'Sri Balaji Traders',
  tradeName: null,
  vendorType: 'SUPPLIER' as const,
  pan: null,
  udyamNumber: null,
  msmeCategory: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  stateId: null,
  pinCode: null,
  paymentTermsDays: null,
  creditLimit: null,
  remarks: null,
};

function updateManyData(tx: ReturnType<typeof setup>['tx']): Record<string, unknown> {
  return (tx.vendor.updateMany.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
}

describe('VendorsService.create', () => {
  it('creates a Draft vendor with the next gap-free code and audits CREATE', async () => {
    const { tx, recorder, service } = setup(41);

    await service.create(createRequest, ACTOR, globalAccess());

    const data = (tx.vendor.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).toMatchObject({ code: 'VEN-0042', legalName: 'Sri Balaji Traders' });
    expect(data).not.toHaveProperty('status');
    expect(recorder.tables()).toEqual(['vendor.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'Vendor' }),
    ]);
  });

  it('refuses a PAN another vendor has with DUPLICATE_PAN', async () => {
    const { tx, recorder, service } = setup();
    tx.vendor.findFirst.mockResolvedValueOnce({ code: 'VEN-0007' });

    await expect(
      codeOf(service.create({ ...createRequest, pan: 'AABCS1234K' }, ACTOR, globalAccess())),
    ).resolves.toBe('DUPLICATE_PAN');
    expect(recorder.committed).toEqual([]);
  });

  it('maps a concurrent unique violation on Udyam to DUPLICATE_UDYAM', async () => {
    const { tx, service } = setup();
    tx.vendor.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['udyamNumber'] } });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_UDYAM',
    );
  });
});

describe('VendorsService.update', () => {
  it('refuses to edit an approved vendor with INVALID_STATUS', async () => {
    const { prisma, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(vendorRow({ status: 'APPROVED' }));

    await expect(
      codeOf(
        service.update(VENDOR_ID, { ...createRequest, city: 'Hyderabad' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('INVALID_STATUS');
  });

  it('refuses a PAN that contradicts an existing GSTIN with GSTIN_PAN_MISMATCH', async () => {
    const { prisma, service } = setup();
    prisma.vendorGstRegistration.findMany.mockResolvedValue([{ gstin: '36AAACX1234X1Z5' }]);

    await expect(
      codeOf(
        service.update(VENDOR_ID, { ...createRequest, pan: 'AABCS1234K' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('GSTIN_PAN_MISMATCH');
  });

  it('writes nothing when no field changed (credit limit 1200 = 1200.00)', async () => {
    const { prisma, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(
      vendorRow({ creditLimit: new Prisma.Decimal('1200.00') }),
    );

    await service.update(
      VENDOR_ID,
      { ...createRequest, creditLimit: '1200' },
      ACTOR,
      globalAccess(),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports a concurrent change and writes no audit row', async () => {
    const { tx, recorder, service } = setup();
    tx.vendor.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      codeOf(
        service.update(VENDOR_ID, { ...createRequest, city: 'Hyderabad' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('INVALID_STATUS');
    expect(recorder.committed).toEqual([]);
  });
});

describe('VendorsService approval flow', () => {
  it('submits a draft: Pending approval, submitted by the actor', async () => {
    const { tx, service, state } = setup();
    state.after = vendorRow({ status: 'PENDING_APPROVAL', submittedById: ACTOR });

    await service.submit(VENDOR_ID, ACTOR, globalAccess());

    expect(updateManyData(tx)).toMatchObject({ status: 'PENDING_APPROVAL', submittedById: ACTOR });
  });

  it('refuses approval by the submitter with SELF_APPROVAL_NOT_ALLOWED (OQ-35 b)', async () => {
    const { prisma, recorder, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(
      vendorRow({ status: 'PENDING_APPROVAL', submittedById: ACTOR }),
    );

    await expect(
      codeOf(service.approve(VENDOR_ID, { remarks: null }, ACTOR, globalAccess())),
    ).resolves.toBe('SELF_APPROVAL_NOT_ALLOWED');
    expect(recorder.committed).toEqual([]);
  });

  it('refuses rejection by the submitter too (OQ-36)', async () => {
    const { prisma, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(
      vendorRow({ status: 'PENDING_APPROVAL', submittedById: ACTOR }),
    );

    await expect(
      codeOf(service.reject(VENDOR_ID, { remarks: 'Wrong PAN' }, ACTOR, globalAccess())),
    ).resolves.toBe('SELF_APPROVAL_NOT_ALLOWED');
  });

  it('lets another approver approve and audits the status change', async () => {
    const { prisma, tx, recorder, service, state } = setup();
    prisma.vendor.findUnique.mockResolvedValue(
      vendorRow({ status: 'PENDING_APPROVAL', submittedById: OTHER }),
    );
    state.after = vendorRow({ status: 'APPROVED', submittedById: OTHER, decidedById: ACTOR });

    const result = await service.approve(VENDOR_ID, { remarks: null }, ACTOR, globalAccess());

    expect(updateManyData(tx)).toMatchObject({ status: 'APPROVED', decidedById: ACTOR });
    expect(result.canEdit).toBe(false);
    expect(result.canReopen).toBe(true);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'Vendor',
        before: expect.objectContaining({ status: 'PENDING_APPROVAL' }) as unknown,
        after: expect.objectContaining({ status: 'APPROVED' }) as unknown,
      }),
    ]);
  });

  it('refuses approval without masters.vendors.approve', async () => {
    const { prisma, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(
      vendorRow({ status: 'PENDING_APPROVAL', submittedById: OTHER }),
    );
    const makerOnly = scopedAccess('GLOBAL', {}, ['masters.vendors.manage']);

    await expect(
      codeOf(service.approve(VENDOR_ID, { remarks: null }, ACTOR, makerOnly)),
    ).resolves.toBe('FORBIDDEN');
  });

  it('reopens an approved vendor back to Draft', async () => {
    const { prisma, tx, service, state } = setup();
    prisma.vendor.findUnique.mockResolvedValue(vendorRow({ status: 'APPROVED' }));
    state.after = vendorRow({ status: 'DRAFT' });

    const result = await service.reopen(
      VENDOR_ID,
      { remarks: 'Bank changed' },
      ACTOR,
      globalAccess(),
    );

    expect(updateManyData(tx)).toMatchObject({ status: 'DRAFT', submittedById: null });
    expect(result.canEdit).toBe(true);
  });
});

describe('VendorsService.get', () => {
  const bank = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    vendorId: VENDOR_ID,
    accountName: 'Sri Balaji Traders',
    accountNumber: '123456784321',
    ifsc: 'SBIN0001234',
    bankName: 'State Bank of India',
    branchName: null,
    isPrimary: true,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  function withDetails() {
    return { ...vendorRow(), gstRegistrations: [], bankAccounts: [bank], contacts: [] };
  }

  it('masks the bank account number for a view-only user (OQ-35 d)', async () => {
    const { prisma, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(withDetails());
    const viewer = scopedAccess('COMPANY', { companyId: COMPANY_ID }, ['masters.vendors.view']);

    const result = await service.get(VENDOR_ID, ACTOR, viewer);

    expect(result.bankAccounts[0]?.accountNumber).toBe('XXXXXX4321');
  });

  it('shows the full number to a manager', async () => {
    const { prisma, service } = setup();
    prisma.vendor.findUnique.mockResolvedValue(withDetails());

    const result = await service.get(VENDOR_ID, ACTOR, globalAccess());

    expect(result.bankAccounts[0]?.accountNumber).toBe('123456784321');
  });
});
