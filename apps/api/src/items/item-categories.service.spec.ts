import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { ItemCategoriesService } from './item-categories.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CATEGORY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    code: 'IG-0007',
    name: 'Cement',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: ACTOR,
    updatedById: ACTOR,
    ...overrides,
  };
}

function setup(lastNumber: number | null = 6) {
  const recorder = new TransactionRecorder();
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ last: lastNumber }]),
    itemCategory: {
      create: recorder.write('itemCategory.create', () => categoryRow()),
      update: recorder.write('itemCategory.update', () => categoryRow()),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    itemCategory: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    item: { count: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.itemCategory.findFirst.mockResolvedValue(null);
  prisma.item.count.mockResolvedValue(0);

  const service = new ItemCategoriesService(prisma as unknown as PrismaService, new AuditService());

  return { prisma, tx, recorder, service };
}

function createdData(tx: ReturnType<typeof setup>['tx']): Record<string, unknown> {
  return (tx.itemCategory.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
}

describe('ItemCategoriesService.create', () => {
  it('gives the next code after the last saved one', async () => {
    const { tx, service } = setup(6);

    await service.create({ name: 'Cement' }, ACTOR, globalAccess());

    expect(createdData(tx)).toMatchObject({ code: 'IG-0007', name: 'Cement' });
  });

  it('starts at IG-0001 when no category exists', async () => {
    const { tx, service } = setup(null);

    await service.create({ name: 'Aggregate' }, ACTOR, globalAccess());

    expect(createdData(tx)).toMatchObject({ code: 'IG-0001' });
  });

  it('takes the code inside the same transaction as the insert and the audit row', async () => {
    const { prisma, tx, recorder, service } = setup();

    await service.create({ name: 'Cement' }, ACTOR, globalAccess());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(recorder.tables()).toEqual(['itemCategory.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'ItemCategory' }),
    ]);
  });

  it('rejects a duplicate name with DUPLICATE_NAME and takes no code', async () => {
    const { prisma, tx, service } = setup();
    prisma.itemCategory.findFirst.mockResolvedValue({ id: 'other' });

    await expect(codeOf(service.create({ name: 'cement' }, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_NAME',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('writes no audit row when the insert fails', async () => {
    const { tx, recorder, service } = setup();
    tx.itemCategory.create.mockRejectedValue(new Error('database down'));

    await expect(service.create({ name: 'Cement' }, ACTOR, globalAccess())).rejects.toThrow(
      'database down',
    );
    expect(recorder.committed).toEqual([]);
  });
});

describe('ItemCategoriesService.update and deactivate', () => {
  it('renames and audits UPDATE; the code is never written', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.itemCategory.findUnique.mockResolvedValue(categoryRow());
    tx.itemCategory.update.mockImplementation(async () =>
      categoryRow({ name: 'Cement & Binders' }),
    );

    await service.update(CATEGORY_ID, { name: 'Cement & Binders' }, ACTOR, globalAccess());

    const data = (tx.itemCategory.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

    expect(data).not.toHaveProperty('code');
    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'UPDATE' })]);
  });

  it('blocks deactivation while active items use the category', async () => {
    const { prisma, service } = setup();
    prisma.itemCategory.findUnique.mockResolvedValue(categoryRow());
    prisma.item.count.mockResolvedValue(3);

    await expect(codeOf(service.deactivate(CATEGORY_ID, ACTOR, globalAccess()))).resolves.toBe(
      'HAS_ACTIVE_CHILDREN',
    );
  });
});
