import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { StatesService } from '../states/states.service';
import { CompaniesService } from './companies.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const STATE = { id: STATE_ID, gstCode: '36', name: 'Telangana', isActive: true };

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPANY_ID,
    code: 'UIE',
    legalName: 'Unique Infra',
    entityType: 'COMPANY',
    pan: null,
    tan: null,
    cin: null,
    llpin: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateId: null,
    state: null,
    pinCode: null,
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
    company: {
      create: recorder.write('company.create', () => companyRow()),
      update: recorder.write('company.update', () => companyRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    company: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    companyGstRegistration: { findMany: jest.fn() },
    project: { count: jest.fn() },
    state: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.company.findFirst.mockResolvedValue(null);
  prisma.company.count.mockResolvedValue(0);
  prisma.company.findMany.mockResolvedValue([]);
  prisma.companyGstRegistration.findMany.mockResolvedValue([]);
  prisma.project.count.mockResolvedValue(0);
  prisma.state.findUnique.mockResolvedValue(STATE);

  const client = prisma as unknown as PrismaService;
  const service = new CompaniesService(client, new StatesService(client), new AuditService());

  return { prisma, tx, recorder, service };
}

const createRequest = {
  code: 'UIE',
  legalName: 'Unique Infra',
  entityType: 'COMPANY' as const,
  pan: null,
  tan: null,
  cin: null,
  llpin: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  stateId: null,
  pinCode: null,
};

describe('CompaniesService.create', () => {
  it('creates the company and audits it with companyId set, in one transaction', async () => {
    const { prisma, recorder, service } = setup();

    await service.create(createRequest, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual(['company.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'Company',
        entityId: COMPANY_ID,
        companyId: COMPANY_ID,
        actorUserId: ACTOR,
      }),
    ]);
  });

  it('stamps createdById and updatedById', async () => {
    const { tx, service } = setup();

    await service.create(createRequest, ACTOR, globalAccess());

    expect(tx.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: ACTOR, updatedById: ACTOR }) as unknown,
      }),
    );
  });

  it('rejects a duplicate code, compared case-insensitively, with DUPLICATE_CODE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findFirst.mockResolvedValue({ id: 'other' });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
    expect(prisma.company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: { equals: 'UIE', mode: 'insensitive' } } }),
    );
    expect(recorder.committed).toEqual([]);
  });

  it('maps a concurrent unique violation to DUPLICATE_CODE', async () => {
    const { tx, service } = setup();
    tx.company.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
  });

  it('rejects an unknown or inactive state with INVALID_STATE', async () => {
    const { prisma, service } = setup();

    prisma.state.findUnique.mockResolvedValue(null);
    await expect(
      codeOf(service.create({ ...createRequest, stateId: STATE_ID }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATE');

    prisma.state.findUnique.mockResolvedValue({ ...STATE, isActive: false });
    await expect(
      codeOf(service.create({ ...createRequest, stateId: STATE_ID }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATE');
  });

  it('writes no audit row when the insert fails', async () => {
    const { tx, recorder, service } = setup();
    tx.company.create.mockRejectedValue(new Error('database down'));

    await expect(service.create(createRequest, ACTOR, globalAccess())).rejects.toThrow(
      'database down',
    );

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(recorder.committed).toEqual([]);
  });
});

describe('CompaniesService.update', () => {
  const updateRequest = { ...createRequest, legalName: 'Unique Infra Pvt Ltd' };

  it('rejects a changed code with CODE_IMMUTABLE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());

    await expect(
      codeOf(
        service.update(COMPANY_ID, { ...updateRequest, code: 'OTHER' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('CODE_IMMUTABLE');
    expect(recorder.committed).toEqual([]);
  });

  it('accepts the same code in another case, or no code at all', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());

    await expect(
      service.update(COMPANY_ID, { ...updateRequest, code: 'uie' }, ACTOR, globalAccess()),
    ).resolves.toBeDefined();
    await expect(
      service.update(COMPANY_ID, { ...updateRequest, code: undefined }, ACTOR, globalAccess()),
    ).resolves.toBeDefined();
  });

  it('never writes the code column', async () => {
    const { prisma, tx, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());

    await service.update(COMPANY_ID, { ...updateRequest, code: 'UIE' }, ACTOR, globalAccess());

    const data = (tx.company.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).not.toHaveProperty('code');
    expect(data).toMatchObject({ legalName: 'Unique Infra Pvt Ltd', updatedById: ACTOR });
  });

  it('audits an UPDATE with before and after snapshots', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());
    tx.company.update.mockImplementation(async () =>
      companyRow({ legalName: 'Unique Infra Pvt Ltd' }),
    );

    await service.update(COMPANY_ID, updateRequest, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        companyId: COMPANY_ID,
        before: expect.objectContaining({ legalName: 'Unique Infra' }) as unknown,
        after: expect.objectContaining({ legalName: 'Unique Infra Pvt Ltd' }) as unknown,
      }),
    ]);
  });

  it('returns NOT_FOUND for an unknown company', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(
      codeOf(service.update(COMPANY_ID, updateRequest, ACTOR, globalAccess())),
    ).resolves.toBe('NOT_FOUND');
  });

  it('refuses a PAN that contradicts an existing GST registration', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());
    prisma.companyGstRegistration.findMany.mockResolvedValue([{ gstin: '36AABCU3675K1ZY' }]);

    await expect(
      codeOf(
        service.update(COMPANY_ID, { ...updateRequest, pan: 'ZZZZZ9999Z' }, ACTOR, globalAccess()),
      ),
    ).resolves.toBe('GSTIN_PAN_MISMATCH');
    await expect(
      service.update(COMPANY_ID, { ...updateRequest, pan: 'AABCU3675K' }, ACTOR, globalAccess()),
    ).resolves.toBeDefined();
    expect(recorder.audit()).toHaveLength(1);
  });

  it('keeps an inactive state the company already uses', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow({ stateId: STATE_ID }));
    prisma.state.findUnique.mockResolvedValue({ ...STATE, isActive: false });

    await expect(
      service.update(COMPANY_ID, { ...updateRequest, stateId: STATE_ID }, ACTOR, globalAccess()),
    ).resolves.toBeDefined();
  });
});

describe('CompaniesService deactivate and reactivate', () => {
  it('deactivates, audits DEACTIVATE and stamps updatedById', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());
    tx.company.update.mockImplementation(async () => companyRow({ isActive: false }));

    const result = await service.deactivate(COMPANY_ID, ACTOR, globalAccess());

    expect(result.isActive).toBe(false);
    expect(tx.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false, updatedById: ACTOR } }),
    );
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'DEACTIVATE', companyId: COMPANY_ID }),
    ]);
  });

  it('blocks deactivation while active projects exist with HAS_ACTIVE_CHILDREN', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());
    prisma.project.count.mockResolvedValue(2);

    await expect(codeOf(service.deactivate(COMPANY_ID, ACTOR, globalAccess()))).resolves.toBe(
      'HAS_ACTIVE_CHILDREN',
    );
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, isActive: true },
    });
    expect(recorder.committed).toEqual([]);
  });

  it('reactivates and audits REACTIVATE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow({ isActive: false }));

    await service.reactivate(COMPANY_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'REACTIVATE' })]);
  });

  it('is a no-op (no write, no audit) when the state already matches', async () => {
    const { prisma, recorder, service } = setup();
    prisma.company.findUnique.mockResolvedValue(companyRow());

    await service.reactivate(COMPANY_ID, ACTOR, globalAccess());

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recorder.committed).toEqual([]);
  });
});

describe('CompaniesService.list', () => {
  it('searches code and legal name and applies the isActive and entityType filters', async () => {
    const { prisma, service } = setup();

    await service.list(
      {
        page: 3,
        pageSize: 10,
        search: 'uni',
        isActive: 'false',
        entityType: 'SPV',
        sortBy: 'legalName',
        sortDir: 'desc',
      },
      globalAccess(),
    );

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ legalName: 'desc' }, { id: 'asc' }],
        where: {
          isActive: false,
          entityType: 'SPV',
          OR: [
            { code: { contains: 'uni', mode: 'insensitive' } },
            { legalName: { contains: 'uni', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
});
