import { jest } from '@jest/globals';
import { ITEM_IMPORT_MAX_ROWS } from '@uie/contracts';
import { codeOf, globalAccess, scopedAccess } from '../../masters/test-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SheetData } from './import-sheet';
import { ItemImportService } from './item-import.service';

const NOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CEMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

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

function setup() {
  const prisma = {
    unit: { findMany: jest.fn(async () => [{ id: NOS, code: 'NOS', name: 'Numbers' }]) },
    itemCategory: {
      findMany: jest.fn(async () => [{ id: CEMENT, code: 'IG-0001', name: 'Cement' }]),
    },
    item: { findMany: jest.fn(async () => [] as unknown[]) },
  };

  return { prisma, service: new ItemImportService(prisma as unknown as PrismaService) };
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
