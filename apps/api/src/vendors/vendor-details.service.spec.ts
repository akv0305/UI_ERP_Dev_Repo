import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, scopedAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { VendorDetailsService } from './vendor-details.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENDOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BANK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_BANK_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PAN = 'AABCS1234K';
// Telangana (36) + PAN + entity 1 + Z + check character H.
const GSTIN = '36AABCS1234K1ZH';
const TELANGANA = { id: STATE_ID, gstCode: '36', name: 'Telangana', isActive: true };
const AT = new Date('2026-01-01T00:00:00Z');

const gstRequest = {
  stateId: STATE_ID,
  gstin: GSTIN,
  registrationType: 'REGULAR' as const,
  effectiveFrom: null,
  addressLine1: 'Plot 12, IDA Uppal',
  addressLine2: null,
  city: 'Hyderabad',
  pinCode: '500039',
};

const bankRequest = {
  accountName: 'Sri Balaji Traders',
  accountNumber: '123456784321',
  ifsc: 'SBIN0001234',
  bankName: 'State Bank of India',
  branchName: null,
  isPrimary: true,
};

const contactRequest = {
  name: 'Ravi Kumar',
  designation: null,
  phone: '9876543210',
  email: null,
  isPrimary: false,
};

function gstRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    vendorId: VENDOR_ID,
    ...gstRequest,
    state: TELANGANA,
    isActive: true,
    createdAt: AT,
    updatedAt: AT,
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function bankRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_ID,
    vendorId: VENDOR_ID,
    ...bankRequest,
    isPrimary: false,
    isActive: true,
    createdAt: AT,
    updatedAt: AT,
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    vendorId: VENDOR_ID,
    ...contactRequest,
    isActive: true,
    createdAt: AT,
    updatedAt: AT,
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function dataOf(arg: unknown): Record<string, unknown> {
  return (arg as { data: Record<string, unknown> }).data;
}

function setup(vendor: Record<string, unknown> = {}) {
  const recorder = new TransactionRecorder();
  const locked = { id: VENDOR_ID, status: 'DRAFT', isActive: true, pan: PAN, ...vendor };
  const tx = {
    $queryRaw: jest.fn(async () => [locked]),
    vendorGstRegistration: {
      findFirst: jest.fn(async () => null as unknown),
      findUniqueOrThrow: jest.fn(async () => gstRow() as unknown),
      create: recorder.write('vendorGstRegistration.create', () => gstRow()),
      update: recorder.write('vendorGstRegistration.update', (arg) => gstRow(dataOf(arg))),
    },
    vendorBankAccount: {
      findFirst: jest.fn(async () => null as unknown),
      findMany: jest.fn(async () => [] as unknown[]),
      findUniqueOrThrow: jest.fn(async () => bankRow() as unknown),
      create: recorder.write('vendorBankAccount.create', (arg) => bankRow(dataOf(arg))),
      update: recorder.write('vendorBankAccount.update', (arg) => bankRow(dataOf(arg))),
    },
    vendorContact: {
      findMany: jest.fn(async () => [] as unknown[]),
      findUniqueOrThrow: jest.fn(async () => contactRow() as unknown),
      create: recorder.write('vendorContact.create', (arg) => contactRow(dataOf(arg))),
      update: recorder.write('vendorContact.update', (arg) => contactRow(dataOf(arg))),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    vendorGstRegistration: {
      findUnique: jest.fn(async () => ({ vendorId: VENDOR_ID }) as unknown),
    },
    vendorBankAccount: { findUnique: jest.fn(async () => ({ vendorId: VENDOR_ID }) as unknown) },
    vendorContact: { findUnique: jest.fn(async () => ({ vendorId: VENDOR_ID }) as unknown) },
    state: { findUnique: jest.fn(async () => TELANGANA as unknown) },
    $transaction: jest.fn(recorder.run(tx)),
  };
  const client = prisma as unknown as PrismaService;
  const service = new VendorDetailsService(client, new StatesService(client), new AuditService());

  return { tx, prisma, recorder, service };
}

describe('VendorDetailsService GST registrations', () => {
  it('adds a GST registration to a draft vendor and audits CREATE', async () => {
    const { recorder, service } = setup();

    await service.createGst(VENDOR_ID, gstRequest, ACTOR, globalAccess());

    expect(recorder.tables()).toEqual(['vendorGstRegistration.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'VendorGstRegistration' }),
    ]);
  });

  it('refuses while the vendor is approved with INVALID_STATUS (OQ-35 d)', async () => {
    const { recorder, service } = setup({ status: 'APPROVED' });

    await expect(
      codeOf(service.createGst(VENDOR_ID, gstRequest, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATUS');
    expect(recorder.committed).toEqual([]);
  });

  it('refuses a GSTIN that does not carry the vendor PAN with GSTIN_PAN_MISMATCH', async () => {
    const { service } = setup({ pan: 'AABCT9999Z' });

    await expect(
      codeOf(service.createGst(VENDOR_ID, gstRequest, ACTOR, globalAccess())),
    ).resolves.toBe('GSTIN_PAN_MISMATCH');
  });

  it('refuses a GSTIN another vendor has with DUPLICATE_GSTIN', async () => {
    const { tx, service } = setup();
    tx.vendorGstRegistration.findFirst.mockResolvedValueOnce({ vendor: { code: 'VEN-0003' } });

    await expect(
      codeOf(service.createGst(VENDOR_ID, gstRequest, ACTOR, globalAccess())),
    ).resolves.toBe('DUPLICATE_GSTIN');
  });
});

describe('VendorDetailsService bank accounts', () => {
  it('takes primary off the old account first, and audits both changes', async () => {
    const { tx, recorder, service } = setup();
    tx.vendorBankAccount.findMany.mockResolvedValueOnce([
      bankRow({ id: OTHER_BANK_ID, isPrimary: true }),
    ]);

    await service.createBank(VENDOR_ID, bankRequest, ACTOR, globalAccess());

    expect(recorder.tables()).toEqual([
      'vendorBankAccount.update',
      'auditEvent.create',
      'vendorBankAccount.create',
      'auditEvent.create',
    ]);
    expect(dataOf(recorder.committed[0]?.data)).toMatchObject({ isPrimary: false });
  });

  it('keeps only the last 4 digits of the account number in the Audit Log (OQ-37)', async () => {
    const { recorder, service } = setup();

    await service.createBank(VENDOR_ID, bankRequest, ACTOR, globalAccess());

    expect(recorder.audit()[0]).toMatchObject({
      after: expect.objectContaining({ accountNumber: 'XXXXXX4321' }) as unknown,
    });
  });

  it('refuses the same IFSC and account number twice with DUPLICATE_BANK_ACCOUNT', async () => {
    const { tx, service } = setup();
    tx.vendorBankAccount.findFirst.mockResolvedValueOnce({ id: OTHER_BANK_ID });

    await expect(
      codeOf(service.createBank(VENDOR_ID, bankRequest, ACTOR, globalAccess())),
    ).resolves.toBe('DUPLICATE_BANK_ACCOUNT');
  });

  it('clears primary when the primary account is deactivated', async () => {
    const { tx, service } = setup();
    tx.vendorBankAccount.findUniqueOrThrow.mockResolvedValueOnce(bankRow({ isPrimary: true }));

    await service.setBankActive(BANK_ID, false, ACTOR, globalAccess());

    expect(dataOf(tx.vendorBankAccount.update.mock.calls[0]?.[0])).toMatchObject({
      isActive: false,
      isPrimary: false,
    });
  });
});

describe('VendorDetailsService contacts', () => {
  it('allows a contact on an approved vendor (OQ-35 d)', async () => {
    const { recorder, service } = setup({ status: 'APPROVED' });

    await service.createContact(VENDOR_ID, contactRequest, ACTOR, globalAccess());

    expect(recorder.tables()).toEqual(['vendorContact.create', 'auditEvent.create']);
  });

  it('refuses while the vendor is inactive with INVALID_STATUS', async () => {
    const { service } = setup({ isActive: false });

    await expect(
      codeOf(service.createContact(VENDOR_ID, contactRequest, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATUS');
  });

  it('refuses a view-only user with FORBIDDEN', async () => {
    const { service } = setup();
    const viewer = scopedAccess('GLOBAL', {}, ['masters.vendors.view']);

    await expect(
      codeOf(service.createContact(VENDOR_ID, contactRequest, ACTOR, viewer)),
    ).resolves.toBe('FORBIDDEN');
  });
});
