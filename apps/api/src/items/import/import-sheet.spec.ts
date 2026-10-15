import { columnOf, extractRows, findHeader, type SheetData } from './import-sheet';

describe('columnOf', () => {
  it.each([
    ['Description Of Material', 'description'],
    ['Size', 'size'],
    ["Unit's", 'unit'],
    ['UOM', 'unit'],
    ['Group', 'category'],
    ['Category', 'category'],
    ['HSN Code', 'hsn'],
    ['GST %', 'gst'],
    ['S.No', null],
    ['', null],
  ])('%s -> %s', (header, column) => {
    expect(columnOf(header)).toBe(column);
  });
});

const ABSTRACT: SheetData = {
  name: 'Abstrct',
  rows: [
    { rowNumber: 1, cells: ['', 'ABSTRACT'] },
    { rowNumber: 2, cells: ['', 'S.No', 'Description', 'Group No'] },
    { rowNumber: 3, cells: ['', '1', 'Aggregate', '1 ~ 8'] },
  ],
};

const SHEET1: SheetData = {
  name: 'Sheet1',
  rows: [
    { rowNumber: 1, cells: ['UIE MATERIAL LIST'] },
    { rowNumber: 2, cells: ['S.No', 'Description Of Material', 'Size', "Unit's", 'Group'] },
    { rowNumber: 3, cells: ['1', '  Aggregates  ', ' 20   mm ', 'Per Cum', 'Aggregate'] },
    { rowNumber: 4, cells: ['2', '', '', '', ''] },
    { rowNumber: 6, cells: ['3', 'Cement OPC', '53 grade', "Bag's", 'Cement'] },
  ],
};

describe('findHeader', () => {
  it('skips the abstract sheet (no unit column) and finds row 2 of Sheet1', () => {
    const header = findHeader([ABSTRACT, SHEET1]);

    expect(header?.sheet.name).toBe('Sheet1');
    expect(header?.headerRowNumber).toBe(2);
    expect(header?.columns).toEqual({ description: 1, size: 2, unit: 3, category: 4 });
  });

  it('returns null when no sheet has the required columns', () => {
    expect(findHeader([ABSTRACT])).toBeNull();
  });
});

describe('extractRows', () => {
  it('keeps Excel row numbers, normalises spacing and leaves out rows with only S.No', () => {
    const header = findHeader([SHEET1]);

    expect(header).not.toBeNull();

    const rows = extractRows(header!);

    expect(rows.map((row) => row.rowNumber)).toEqual([3, 6]);
    expect(rows[0]).toMatchObject({
      description: 'Aggregates',
      size: '20 mm',
      unitText: 'Per Cum',
      categoryText: 'Aggregate',
      unitId: null,
      categoryId: null,
      hsnCode: '',
      gstRate: '',
    });
  });
});
