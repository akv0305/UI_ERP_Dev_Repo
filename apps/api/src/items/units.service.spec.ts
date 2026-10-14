import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, scopedAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from './units.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNIT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function unitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: UNIT_ID,
    code: 'MT',
    name: 'Metric Ton',
    decimalPlaces: 3,
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
    unit: {
      create: recorder.write('unit.create', () => unitRow()),
      update: recorder.write('unit.update', () => unitRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    unit: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    item: { count: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.unit.findFirst.mockResolvedValue(null);
  prisma.unit.findMany.mockResolvedValue([]);
  prisma.unit.count.mockResolvedValue(0);
  prisma.item.count.mockResolvedValue(0);

  const service = new UnitsService(prisma as unknown as PrismaService, new AuditService());

  return { prisma, tx, recorder, service };
}

const createRequest = { code: 'MT', name: 'Metric Ton', decimalPlaces: 3 };

describe('UnitsService.create', () => {
  it('creates the unit and audits CREATE in one transaction', async () => {
    const { prisma, recorder, service } = setup();

    await service.create(createRequest, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual(['unit.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'Unit', entityId: UNIT_ID }),
    ]);
  });

  it('rejects a duplicate code with DUPLICATE_CODE', async () => {
    const { prisma, recorder, service } = setup();
    prisma.unit.findFirst.mockResolvedValueOnce({ id: 'other' });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_CODE',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('rejects a duplicate name, compared case-insensitively, with DUPLICATE_NAME', async () => {
    const { prisma, service } = setup();
    prisma.unit.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other' });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_NAME',
    );
    expect(prisma.unit.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'Metric Ton', mode: 'insensitive' } },
      }),
    );
  });

  it('maps a concurrent name index violation to DUPLICATE_NAME', async () => {
    const { tx, service } = setup();
    tx.unit.create.mockRejectedValue(
      Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: 'units_name_lower_key' },
      }),
    );

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_NAME',
    );
  });

  it('refuses a user whose manage permission is only company-scoped', async () => {
    const { recorder, service } = setup();
    const access = scopedAccess('COMPANY', { companyId: COMPANY_ID }, ['masters.items.manage']);

    await expect(codeOf(service.create(createRequest, ACTOR, access))).resolves.toBe('FORBIDDEN');
    expect(recorder.committed).toEqual([]);
  });
});

describe('UnitsService.update', () => {
  it('rejects a changed code with CODE_IMMUTABLE', async () => {
    const { prisma, service } = setup();
    prisma.unit.findUnique.mockResolvedValue(unitRow());

    await expect(
      codeOf(service.update(UNIT_ID, { ...createRequest, code: 'KG' }, ACTOR, globalAccess())),
    ).resolves.toBe('CODE_IMMUTABLE');
  });

  it('writes nothing when no field changed', async () => {
    const { prisma, service } = setup();
    prisma.unit.findUnique.mockResolvedValue(unitRow());

    await service.update(UNIT_ID, createRequest, ACTOR, globalAccess());

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits an UPDATE with before and after', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.unit.findUnique.mockResolvedValue(unitRow());
    tx.unit.update.mockImplementation(async () => unitRow({ name: 'Metric Tonne' }));

    await service.update(
      UNIT_ID,
      { ...createRequest, name: 'Metric Tonne' },
      ACTOR,
      globalAccess(),
    );

    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        before: expect.objectContaining({ name: 'Metric Ton' }) as unknown,
        after: expect.objectContaining({ name: 'Metric Tonne' }) as unknown,
      }),
    ]);
  });
});

describe('UnitsService deactivate and reactivate', () => {
  it('blocks deactivation while active items use the unit', async () => {
    const { prisma, recorder, service } = setup();
    prisma.unit.findUnique.mockResolvedValue(unitRow());
    prisma.item.count.mockResolvedValue(1);

    await expect(codeOf(service.deactivate(UNIT_ID, ACTOR, globalAccess()))).resolves.toBe(
      'HAS_ACTIVE_CHILDREN',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('deactivates and audits DEACTIVATE', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.unit.findUnique.mockResolvedValue(unitRow());
    tx.unit.update.mockImplementation(async () => unitRow({ isActive: false }));

    await service.deactivate(UNIT_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'DEACTIVATE' })]);
  });

  it('is a no-op when the state already matches', async () => {
    const { prisma, service } = setup();
    prisma.unit.findUnique.mockResolvedValue(unitRow());

    await service.reactivate(UNIT_ID, ACTOR, globalAccess());

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('UnitsService.list', () => {
  it('lets a GLOBAL view-only user list units without manage rights', async () => {
    const { prisma, service } = setup();
    prisma.unit.findMany.mockResolvedValue([unitRow()]);
    prisma.unit.count.mockResolvedValue(1);
    const access = scopedAccess('GLOBAL', {}, ['masters.items.view']);

    const result = await service.list(
      { page: 1, pageSize: 20, sortBy: 'code', sortDir: 'asc' },
      access,
    );

    expect(result.items[0]?.canManage).toBe(false);
  });
});
