import { jest } from '@jest/globals';
import { ITEM_IMPORT_MAX_ROWS, type ItemImportRowInput } from '@uie/contracts';
import type { AuditService } from '../../audit/audit.service';
import { codeOf, globalAccess, scopedAccess } from '../../masters/test-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SheetData } from './import-sheet';
import { ItemImportService } from './item-import.service';

const NOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CEMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const ACTOR = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

const HEADER = ['S.No', 'Description Of Material', 'Size', "Unit's", 'Group'];

function sheet(dataRows: string[][]): SheetData[] {
  return [
    {
      name: 'Sheet1',
      rows: [
        { rowNumber: 1, cells: HEADER },
        ...dataRows.map((cells, index) => ({ rowNumber: index + 2, cells })),
      ],
    },
  ];
}

function gridRow(
  rowNumber: number,
  overrides: Partial<ItemImportRowInput> = {},
): ItemImportRowInput {
  return {
    rowNumber,
    description: 'OPC Cement',
    size: '53 grade',
    unitText: "No's",
    categoryText: 'Cement',
    unitId: null,
    categoryId: null,
    hsnCode: '',
    gstRate: '',
    ...overrides,
  };
}

function setup() {
  const tx = {
    $executeRaw: jest.fn(async () => 1),
    $queryRaw: jest.fn(async () => [{ last: 7 }]),
    unit: { findMany: jest.fn(async () => [{ id: NOS, code: 'NOS', name: 'Numbers' }]) },
    itemCategory: {
      findMany: jest.fn(async () => [{ id: CEMENT, code: 'IG-0001', name: 'Cement' }]),
    },
    item: {
      findMany: jest.fn(async () => [] as unknown[]),
      createMany: jest.fn(async (_args: { data: unknown[] }) => ({ count: 0 })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>, _options?: unknown) =>
      fn(tx),
    ),
  };
  const audit = { recordMany: jest.fn(async (_tx: unknown, _events: unknown[]) => undefined) };

  return {
    prisma,
    tx,
    audit,
    service: new ItemImportService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    ),
  };
}

describe('ItemImportService.preview', () => {
  it('refuses a user without masters.items.manage before reading the file', async () => {
    const { service } = setup();
    const load = jest.fn(async () => sheet([]));
    const viewer = scopedAccess('GLOBAL', {}, ['masters.items.view']);

    await expect(codeOf(service.preview(viewer, load))).resolves.toBe('FORBIDDEN');
    expect(load).not.toHaveBeenCalled();
  });

  it('reports IMPORT_HEADER_NOT_FOUND', async () => {
    const { service } = setup();
    const load = async (): Promise<SheetData[]> => [
      { name: 'Sheet1', rows: [{ rowNumber: 1, cells: ['Name', 'Qty'] }] },
    ];

    await expect(codeOf(service.preview(globalAccess(), load))).resolves.toBe(
      'IMPORT_HEADER_NOT_FOUND',
    );
  });

  it('reports IMPORT_NO_ROWS for a header with nothing under it', async () => {
    const { service } = setup();

    await expect(codeOf(service.preview(globalAccess(), async () => sheet([])))).resolves.toBe(
      'IMPORT_NO_ROWS',
    );
  });

  it('reports IMPORT_TOO_MANY_ROWS above the limit', async () => {
    const { service } = setup();
    const rows = Array.from({ length: ITEM_IMPORT_MAX_ROWS + 1 }, (_, index) => [
      String(index + 1),
      `Item ${index}`,
      '',
      'Nos',
      'Cement',
    ]);

    await expect(codeOf(service.preview(globalAccess(), async () => sheet(rows)))).resolves.toBe(
      'IMPORT_TOO_MANY_ROWS',
    );
  });

  it('returns the sheet, header row, checked rows and summary', async () => {
    const { service } = setup();
    const result = await service.preview(globalAccess(), async () =>
      sheet([
        ['1', 'OPC Cement', '53 grade', "No's", 'Cement'],
        ['2', 'PPC Cement', '', 'Bags', 'Cement'],
      ]),
    );

    expect(result).toMatchObject({ sheetName: 'Sheet1', headerRowNumber: 1 });
    expect(result.rows[0]).toMatchObject({ status: 'READY', unitId: NOS, categoryId: CEMENT });
    expect(result.summary).toEqual({ total: 2, ready: 1, warning: 0, error: 1 });
    expect(result.unmatchedUnits).toEqual([{ text: 'Bags', rows: 1 }]);
  });
});

describe('ItemImportService.commit', () => {
  it('refuses a user without masters.items.manage and writes nothing', async () => {
    const { service, prisma } = setup();
    const viewer = scopedAccess('GLOBAL', {}, ['masters.items.view']);

    await expect(codeOf(service.commit({ rows: [gridRow(2)] }, ACTOR, viewer))).resolves.toBe(
      'FORBIDDEN',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates good rows as Pending approval with gap-free codes and skips red rows', async () => {
    const { service, tx, audit } = setup();
    const result = await service.commit(
      {
        rows: [
          gridRow(2),
          gridRow(3, { description: 'PPC Cement', unitText: 'Bags' }),
          gridRow(4, { description: 'White Cement', size: '', gstRate: '18' }),
        ],
      },
      ACTOR,
      globalAccess(),
    );

    expect(result).toMatchObject({
      imported: 2,
      skipped: 1,
      firstCode: 'ITM-000008',
      lastCode: 'ITM-000009',
    });
    expect(result.rows.map((row) => row.code)).toEqual(['ITM-000008', null, 'ITM-000009']);
    expect(result.rows[1]?.issues.map((issue) => issue.code)).toEqual(['UNIT_NOT_MATCHED']);

    const data = tx.item.createMany.mock.calls[0]?.[0].data;

    expect(data).toHaveLength(2);
    expect(data?.[0]).toMatchObject({
      code: 'ITM-000008',
      description: 'OPC Cement',
      size: '53 grade',
      unitId: NOS,
      categoryId: CEMENT,
      itemUse: 'STOCK_AND_ISSUE',
      status: 'PENDING_APPROVAL',
      submittedById: ACTOR,
      createdById: ACTOR,
    });
    expect(data?.[1]).toMatchObject({ code: 'ITM-000009', size: null, gstRate: '18' });
    expect(audit.recordMany.mock.calls[0]?.[1]).toHaveLength(2);
  });

  it('writes nothing when every row is red', async () => {
    const { service, tx, audit } = setup();
    const result = await service.commit(
      { rows: [gridRow(2, { unitText: '' })] },
      ACTOR,
      globalAccess(),
    );

    expect(result).toMatchObject({ imported: 0, skipped: 1, firstCode: null, lastCode: null });
    expect(tx.item.createMany).not.toHaveBeenCalled();
    expect(audit.recordMany).not.toHaveBeenCalled();
  });
});
