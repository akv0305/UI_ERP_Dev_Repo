import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { DesignationsService } from './designations.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DESIGNATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function designationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DESIGNATION_ID,
    code: 'DSG-0003',
    name: 'Site Engineer',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function setup(lastNumber: number | null = 2) {
  const recorder = new TransactionRecorder();
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ last: lastNumber }]),
    designation: {
      create: recorder.write('designation.create', () => designationRow()),
      update: recorder.write('designation.update', () => designationRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    designation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    employee: { count: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.designation.findFirst.mockResolvedValue(null);
  prisma.employee.count.mockResolvedValue(0);

  const service = new DesignationsService(prisma as unknown as PrismaService, new AuditService());

  return { prisma, tx, recorder, service };
}

function createdData(tx: ReturnType<typeof setup>['tx']): Record<string, unknown> {
  return (tx.designation.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
}

describe('DesignationsService.create', () => {
  it('gives the next code after the last saved one', async () => {
    const { tx, service } = setup(2);

    await service.create({ name: 'Site Engineer' }, ACTOR, globalAccess());

    expect(createdData(tx)).toMatchObject({ code: 'DSG-0003', name: 'Site Engineer' });
  });

  it('starts at DSG-0001 when no designation exists', async () => {
    const { tx, service } = setup(null);

    await service.create({ name: 'Purchase Manager' }, ACTOR, globalAccess());

    expect(createdData(tx)).toMatchObject({ code: 'DSG-0001' });
  });

  it('takes the code inside the same transaction as the insert and the audit row', async () => {
    const { prisma, tx, recorder, service } = setup();

    await service.create({ name: 'Site Engineer' }, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual(['designation.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'Designation' }),
    ]);
  });

  it('rejects a duplicate name with DUPLICATE_NAME and takes no code', async () => {
    const { prisma, tx, service } = setup();
    prisma.designation.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      codeOf(service.create({ name: 'site engineer' }, ACTOR, globalAccess())),
    ).resolves.toBe('DUPLICATE_NAME');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('DesignationsService.update and deactivate', () => {
  it('renames and audits UPDATE; the code is never written', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.designation.findUnique.mockResolvedValue(designationRow());
    tx.designation.update.mockImplementation(async () =>
      designationRow({ name: 'Senior Site Engineer' }),
    );

    await service.update(DESIGNATION_ID, { name: 'Senior Site Engineer' }, ACTOR, globalAccess());

    const data = (tx.designation.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

    expect(data).not.toHaveProperty('code');
    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'UPDATE' })]);
  });

  it('blocks deactivation while active employees use it (OQ-144 b)', async () => {
    const { prisma, service } = setup();
    prisma.designation.findUnique.mockResolvedValue(designationRow());
    prisma.employee.count.mockResolvedValue(2);

    await expect(codeOf(service.deactivate(DESIGNATION_ID, ACTOR, globalAccess()))).resolves.toBe(
      'HAS_ACTIVE_CHILDREN',
    );
  });

  it('records DEACTIVATE when no active employee uses it', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.designation.findUnique.mockResolvedValue(designationRow());
    tx.designation.update.mockImplementation(async () => designationRow({ isActive: false }));

    await service.deactivate(DESIGNATION_ID, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'DEACTIVATE' })]);
  });
});
