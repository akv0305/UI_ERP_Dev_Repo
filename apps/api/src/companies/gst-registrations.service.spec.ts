import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { GstRegistrationsService } from './gst-registrations.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REGISTRATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TELANGANA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ANDHRA_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const TELANGANA = { id: TELANGANA_ID, gstCode: '36', name: 'Telangana', isActive: true };
const ANDHRA = { id: ANDHRA_ID, gstCode: '37', name: 'Andhra Pradesh', isActive: true };

// Valid GSTINs (check digit verified): both belong to PAN AABCU3675K.
const GSTIN_TS = '36AABCU3675K1ZY';
const GSTIN_AP = '37AABCU3675K2ZV';

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REGISTRATION_ID,
    companyId: COMPANY_ID,
    stateId: TELANGANA_ID,
    state: TELANGANA,
    gstin: GSTIN_TS,
    registrationType: 'REGULAR',
    effectiveFrom: new Date('2026-04-01T00:00:00Z'),
    addressLine1: 'Plot 1',
    addressLine2: null,
    city: 'Hyderabad',
    pinCode: '500081',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function setup() {
  const recorder = new TransactionRecorder();
  const tx = {
    companyGstRegistration: {
      create: recorder.write('registration.create', () => registrationRow()),
      update: recorder.write('registration.update', () => registrationRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    company: { findUnique: jest.fn() },
    companyGstRegistration: { findUnique: jest.fn(), findFirst: jest.fn() },
    state: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, pan: null });
  prisma.companyGstRegistration.findFirst.mockResolvedValue(null);
  prisma.state.findUnique.mockImplementation(async (arg: unknown) => {
    const id = (arg as { where: { id: string } }).where.id;

    return [TELANGANA, ANDHRA].find((state) => state.id === id) ?? null;
  });

  const client = prisma as unknown as PrismaService;
  const service = new GstRegistrationsService(
    client,
    new StatesService(client),
    new AuditService(),
  );

  return { prisma, tx, recorder, service };
}

const request = {
  stateId: TELANGANA_ID,
  gstin: GSTIN_TS,
  registrationType: 'REGULAR' as const,
  effectiveFrom: '2026-04-01',
  addressLine1: 'Plot 1',
  addressLine2: null,
  city: 'Hyderabad',
  pinCode: '500081',
};

describe('GstRegistrationsService.create', () => {
  it('creates a registration and audits it with the company id, in one transaction', async () => {
    const { prisma, tx, recorder, service } = setup();

    const result = await service.create(COMPANY_ID, request, ACTOR, globalAccess());

    expect(result).toMatchObject({ gstin: GSTIN_TS, effectiveFrom: '2026-04-01' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.companyGstRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_ID,
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          createdById: ACTOR,
        }) as unknown,
      }),
    );
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'CompanyGstRegistration',
        entityId: REGISTRATION_ID,
        companyId: COMPANY_ID,
      }),
    ]);
  });

  it('returns NOT_FOUND for an unknown company', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(codeOf(service.create(COMPANY_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'NOT_FOUND',
    );
  });

  it('rejects a bad format or check digit with INVALID_GSTIN', async () => {
    const { recorder, service } = setup();

    await expect(
      codeOf(
        service.create(COMPANY_ID, { ...request, gstin: '36AABCU3675K1ZX' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('INVALID_GSTIN');
    await expect(
      codeOf(
        service.create(COMPANY_ID, { ...request, gstin: 'NOT-A-GSTIN' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('INVALID_GSTIN');
    expect(recorder.committed).toEqual([]);
  });

  it('rejects a GSTIN whose first two digits differ from the state with GSTIN_STATE_MISMATCH', async () => {
    const { recorder, service } = setup();

    await expect(
      codeOf(service.create(COMPANY_ID, { ...request, stateId: ANDHRA_ID }, ACTOR, globalAccess())),
    ).resolves.toBe('GSTIN_STATE_MISMATCH');
    expect(recorder.committed).toEqual([]);
  });

  it('accepts a GSTIN that matches its state (Andhra Pradesh)', async () => {
    const { service } = setup();

    await expect(
      service.create(
        COMPANY_ID,
        { ...request, stateId: ANDHRA_ID, gstin: GSTIN_AP },
        ACTOR,
        globalAccess(),
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown state with INVALID_STATE', async () => {
    const { service } = setup();

    await expect(
      codeOf(
        service.create(COMPANY_ID, { ...request, stateId: REGISTRATION_ID }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('INVALID_STATE');
  });

  it('checks characters 3-12 against the company PAN with GSTIN_PAN_MISMATCH', async () => {
    const { prisma, service } = setup();

    prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, pan: 'ZZZZZ9999Z' });
    await expect(codeOf(service.create(COMPANY_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'GSTIN_PAN_MISMATCH',
    );

    prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, pan: 'AABCU3675K' });
    await expect(service.create(COMPANY_ID, request, ACTOR, globalAccess())).resolves.toBeDefined();
  });

  it('skips the PAN check when the company has no PAN', async () => {
    const { service } = setup();

    await expect(service.create(COMPANY_ID, request, ACTOR, globalAccess())).resolves.toBeDefined();
  });

  it('rejects an existing GSTIN with DUPLICATE_GSTIN', async () => {
    const { prisma, recorder, service } = setup();
    prisma.companyGstRegistration.findFirst.mockResolvedValue({ id: 'other' });

    await expect(codeOf(service.create(COMPANY_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_GSTIN',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('maps a concurrent unique violation to DUPLICATE_GSTIN', async () => {
    const { tx, service } = setup();
    tx.companyGstRegistration.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(codeOf(service.create(COMPANY_ID, request, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_GSTIN',
    );
  });

  it('writes no audit row when the insert fails', async () => {
    const { tx, recorder, service } = setup();
    tx.companyGstRegistration.create.mockRejectedValue(new Error('database down'));

    await expect(service.create(COMPANY_ID, request, ACTOR, globalAccess())).rejects.toThrow(
      'database down',
    );

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(recorder.committed).toEqual([]);
  });
});

describe('GstRegistrationsService.update', () => {
  it('excludes itself from the duplicate check and audits an UPDATE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue(registrationRow());
    prisma.company.findUnique.mockResolvedValue({ pan: 'AABCU3675K' });

    await service.update(
      REGISTRATION_ID,
      { ...request, city: 'Secunderabad' },
      ACTOR,
      globalAccess(),
    );

    expect(prisma.companyGstRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gstin: GSTIN_TS, id: { not: REGISTRATION_ID } },
      }),
    );
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'UPDATE', companyId: COMPANY_ID }),
    ]);
  });

  it('applies the same GSTIN rules on update', async () => {
    const { prisma, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue(registrationRow());

    await expect(
      codeOf(
        service.update(REGISTRATION_ID, { ...request, stateId: ANDHRA_ID }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('GSTIN_STATE_MISMATCH');
    await expect(
      codeOf(
        service.update(
          REGISTRATION_ID,
          { ...request, gstin: '36AABCU3675K1ZX' },
          ACTOR,
          globalAccess(),
        ),
      ),
    ).resolves.toBe('INVALID_GSTIN');

    prisma.companyGstRegistration.findFirst.mockResolvedValue({ id: 'other' });
    await expect(
      codeOf(service.update(REGISTRATION_ID, request, ACTOR, globalAccess())),
    ).resolves.toBe('DUPLICATE_GSTIN');
  });

  it('returns NOT_FOUND for an unknown registration', async () => {
    const { prisma, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue(null);

    await expect(
      codeOf(service.update(REGISTRATION_ID, request, ACTOR, globalAccess())),
    ).resolves.toBe('NOT_FOUND');
  });
});

describe('GstRegistrationsService deactivate and reactivate', () => {
  it('deactivates and audits DEACTIVATE with the company id', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue(registrationRow());
    tx.companyGstRegistration.update.mockImplementation(async () =>
      registrationRow({ isActive: false }),
    );

    const result = await service.deactivate(REGISTRATION_ID, ACTOR, globalAccess());

    expect(result.isActive).toBe(false);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'DEACTIVATE', companyId: COMPANY_ID }),
    ]);
  });

  it('reactivates and audits REACTIVATE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.companyGstRegistration.findUnique.mockResolvedValue(
      registrationRow({ isActive: false }),
    );

    await service.reactivate(REGISTRATION_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'REACTIVATE' })]);
  });
});
