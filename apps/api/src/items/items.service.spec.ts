import { jest } from '@jest/globals';
import { AuditService } from '../audit/audit.service';
import { codeOf, globalAccess, scopedAccess, TransactionRecorder } from '../masters/test-harness';
import type { PrismaService } from '../prisma/prisma.service';
import { ItemsService } from './items.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CATEGORY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UNIT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const CATEGORY = { id: CATEGORY_ID, code: 'IG-0002', name: 'Cement', isActive: true };
const UNIT = { id: UNIT_ID, code: 'BAG', name: 'Bag', decimalPlaces: 0, isActive: true };

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    code: 'ITM-000042',
    description: 'OPC 53 Grade Cement',
    size: null,
    categoryId: CATEGORY_ID,
    unitId: UNIT_ID,
    category: CATEGORY,
    unit: UNIT,
    itemUse: 'STOCK_AND_ISSUE',
    hsnCode: null,
    gstRate: null,
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
  const state = { after: itemRow() as unknown };
  const recorder = new TransactionRecorder();
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ last: lastNumber }]),
    item: {
      findFirst: jest.fn(async () => null as unknown),
      create: recorder.write('item.create', () => itemRow()),
      update: recorder.write('item.update', () => state.after),
      updateMany: recorder.write('item.updateMany', () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => state.after),
    },
    auditEvent: { create: recorder.write('auditEvent.create') },
  };
  const prisma = {
    item: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    itemCategory: { findUnique: jest.fn() },
    unit: { findUnique: jest.fn() },
    $transaction: jest.fn(recorder.run(tx)),
  };
  prisma.itemCategory.findUnique.mockResolvedValue({ isActive: true });
  prisma.unit.findUnique.mockResolvedValue({ isActive: true });
  prisma.item.findUnique.mockResolvedValue(itemRow());

  const service = new ItemsService(prisma as unknown as PrismaService, new AuditService());

  return { prisma, tx, recorder, service, state };
}

const createRequest = {
  description: 'OPC 53 Grade Cement',
  size: null,
  categoryId: CATEGORY_ID,
  unitId: UNIT_ID,
  itemUse: 'STOCK_AND_ISSUE' as const,
  hsnCode: null,
  gstRate: null,
  remarks: null,
};

function updateManyData(tx: ReturnType<typeof setup>['tx']): Record<string, unknown> {
  return (tx.item.updateMany.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
}

describe('ItemsService.create', () => {
  it('creates a Draft item with the next gap-free code and audits CREATE', async () => {
    const { tx, recorder, service } = setup(41);

    await service.create(createRequest, ACTOR, globalAccess());

    const data = (tx.item.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).toMatchObject({ code: 'ITM-000042', description: 'OPC 53 Grade Cement' });
    expect(data).not.toHaveProperty('status');
    expect(recorder.tables()).toEqual(['item.create', 'auditEvent.create']);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'Item' }),
    ]);
  });

  it('rejects a duplicate description + size + unit with DUPLICATE_ITEM', async () => {
    const { tx, recorder, service } = setup();
    tx.item.findFirst.mockResolvedValueOnce({ code: 'ITM-000007' });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'DUPLICATE_ITEM',
    );
    expect(recorder.committed).toEqual([]);
  });

  it('checks duplicates only after taking the series lock', async () => {
    const { tx, service } = setup();
    const order: string[] = [];
    tx.$executeRaw.mockImplementation(async () => {
      order.push('lock');

      return 0;
    });
    tx.item.findFirst.mockImplementation(async () => {
      order.push('duplicate-check');

      return null;
    });

    await service.create(createRequest, ACTOR, globalAccess());

    expect(order).toEqual(['lock', 'duplicate-check']);
  });

  it('refuses an inactive category with INVALID_CATEGORY', async () => {
    const { prisma, service } = setup();
    prisma.itemCategory.findUnique.mockResolvedValue({ isActive: false });

    await expect(codeOf(service.create(createRequest, ACTOR, globalAccess()))).resolves.toBe(
      'INVALID_CATEGORY',
    );
  });
});

describe('ItemsService.update', () => {
  it('refuses to edit an approved item (locked) with INVALID_STATUS', async () => {
    const { prisma, service } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'APPROVED' }));

    await expect(
      codeOf(service.update(ITEM_ID, { ...createRequest, remarks: 'x' }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATUS');
  });

  it('refuses to edit a pending item with INVALID_STATUS', async () => {
    const { prisma, service } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'PENDING_APPROVAL' }));

    await expect(
      codeOf(service.update(ITEM_ID, { ...createRequest, remarks: 'x' }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATUS');
  });

  it('edits a rejected item and audits UPDATE', async () => {
    const { prisma, recorder, service, state } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'REJECTED' }));
    state.after = itemRow({ status: 'REJECTED', remarks: 'fixed' });

    await service.update(ITEM_ID, { ...createRequest, remarks: 'fixed' }, ACTOR, globalAccess());

    expect(recorder.audit()).toEqual([expect.objectContaining({ action: 'UPDATE' })]);
  });

  it('writes nothing when no field changed', async () => {
    const { prisma, service } = setup();

    await service.update(ITEM_ID, createRequest, ACTOR, globalAccess());

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ItemsService approval flow', () => {
  it('submits a draft: Pending approval, submitted by the actor', async () => {
    const { tx, service, state } = setup();
    state.after = itemRow({ status: 'PENDING_APPROVAL' });

    await service.submit(ITEM_ID, ACTOR, globalAccess());

    expect(updateManyData(tx)).toMatchObject({
      status: 'PENDING_APPROVAL',
      submittedById: ACTOR,
    });
  });

  it('lets the submitter approve their own item (OQ-28)', async () => {
    const { prisma, tx, recorder, service, state } = setup();
    prisma.item.findUnique.mockResolvedValue(
      itemRow({ status: 'PENDING_APPROVAL', submittedById: ACTOR }),
    );
    state.after = itemRow({ status: 'APPROVED', decidedById: ACTOR });

    const result = await service.approve(ITEM_ID, { remarks: null }, ACTOR, globalAccess());

    expect(updateManyData(tx)).toMatchObject({ status: 'APPROVED', decidedById: ACTOR });
    expect(result.canEdit).toBe(false);
    expect(result.canReopen).toBe(true);
    expect(recorder.audit()).toEqual([
      expect.objectContaining({
        action: 'UPDATE',
        before: expect.objectContaining({ status: 'PENDING_APPROVAL' }) as unknown,
        after: expect.objectContaining({ status: 'APPROVED' }) as unknown,
      }),
    ]);
  });

  it('refuses to approve a draft with INVALID_STATUS', async () => {
    const { service } = setup();

    await expect(
      codeOf(service.approve(ITEM_ID, { remarks: null }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATUS');
  });

  it('refuses approval without masters.items.approve', async () => {
    const { prisma, service } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'PENDING_APPROVAL' }));
    const makerOnly = scopedAccess('GLOBAL', {}, ['masters.items.manage']);

    await expect(
      codeOf(service.approve(ITEM_ID, { remarks: null }, ACTOR, makerOnly)),
    ).resolves.toBe('FORBIDDEN');
  });

  it('rejects with remarks: status Rejected', async () => {
    const { prisma, tx, service, state } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'PENDING_APPROVAL' }));
    state.after = itemRow({ status: 'REJECTED' });

    await service.reject(ITEM_ID, { remarks: 'Wrong unit' }, ACTOR, globalAccess());

    expect(updateManyData(tx)).toMatchObject({
      status: 'REJECTED',
      decisionRemarks: 'Wrong unit',
    });
  });

  it('reopens an approved item back to Draft', async () => {
    const { prisma, tx, service, state } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'APPROVED' }));
    state.after = itemRow({ status: 'DRAFT' });

    const result = await service.reopen(
      ITEM_ID,
      { remarks: 'Size to be corrected' },
      ACTOR,
      globalAccess(),
    );

    expect(updateManyData(tx)).toMatchObject({ status: 'DRAFT', submittedById: null });
    expect(result.canEdit).toBe(true);
  });

  it('reports a concurrent status change and writes no audit row', async () => {
    const { prisma, tx, recorder, service } = setup();
    prisma.item.findUnique.mockResolvedValue(itemRow({ status: 'PENDING_APPROVAL' }));
    tx.item.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      codeOf(service.approve(ITEM_ID, { remarks: null }, ACTOR, globalAccess())),
    ).resolves.toBe('INVALID_STATUS');
    expect(recorder.committed).toEqual([]);
  });
});

describe('ItemsService.reactivate', () => {
  it('refuses while the category is inactive with PARENT_INACTIVE', async () => {
    const { prisma, service } = setup();
    prisma.item.findUnique.mockResolvedValue(
      itemRow({ isActive: false, category: { ...CATEGORY, isActive: false } }),
    );

    await expect(codeOf(service.reactivate(ITEM_ID, ACTOR, globalAccess()))).resolves.toBe(
      'PARENT_INACTIVE',
    );
  });
});
