import { ITEM_IMPORT_CELL_MAX, normalizeText, type ItemImportRowInput } from '@uie/contracts';

export interface SheetRow {
  /** Excel row number (1-based). */
  rowNumber: number;
  cells: readonly string[];
}

export interface SheetData {
  name: string;
  /** Non-empty rows only, in sheet order. */
  rows: readonly SheetRow[];
}

/** The header must be within the first 10 non-empty rows of a sheet (PD-042). */
export const HEADER_SCAN_ROWS = 10;

export type ImportColumn = 'description' | 'size' | 'unit' | 'category' | 'hsn' | 'gst';

const REQUIRED_COLUMNS: readonly ImportColumn[] = ['description', 'unit', 'category'];

export interface SheetHeader {
  sheet: SheetData;
  headerRowNumber: number;
  /** Column -> 0-based cell index. */
  columns: Partial<Record<ImportColumn, number>>;
}

/** Which import column a header cell names: case, spaces and punctuation are ignored. */
export function columnOf(header: string): ImportColumn | null {
  const key = header.toLowerCase().replace(/[^a-z]/g, '');

  if (key.length === 0) {
    return null;
  }

  if (key.startsWith('hsn')) {
    return 'hsn';
  }

  if (key.startsWith('gst')) {
    return 'gst';
  }

  if (key.includes('description')) {
    return 'description';
  }

  if (key.startsWith('size') || key.startsWith('spec')) {
    return 'size';
  }

  if (key.startsWith('unit') || key.startsWith('uom')) {
    return 'unit';
  }

  if (key.startsWith('group') || key.startsWith('category')) {
    return 'category';
  }

  return null;
}

/** First sheet with a header row naming Description, Unit and Group; the first match per column wins. */
export function findHeader(sheets: readonly SheetData[]): SheetHeader | null {
  for (const sheet of sheets) {
    for (const row of sheet.rows.slice(0, HEADER_SCAN_ROWS)) {
      const columns: Partial<Record<ImportColumn, number>> = {};

      row.cells.forEach((cell, index) => {
        const column = columnOf(cell);

        if (column !== null && columns[column] === undefined) {
          columns[column] = index;
        }
      });

      if (REQUIRED_COLUMNS.every((column) => columns[column] !== undefined)) {
        return { sheet, headerRowNumber: row.rowNumber, columns };
      }
    }
  }

  return null;
}

/** Data rows below the header. Rows with no description, size, unit or group (e.g. only S.No) are left out. */
export function extractRows(header: SheetHeader): ItemImportRowInput[] {
  const cell = (row: SheetRow, column: ImportColumn): string => {
    const index = header.columns[column];

    return index === undefined
      ? ''
      : (row.cells[index] ?? '').trim().slice(0, ITEM_IMPORT_CELL_MAX);
  };
  const rows: ItemImportRowInput[] = [];

  for (const row of header.sheet.rows) {
    if (row.rowNumber <= header.headerRowNumber) {
      continue;
    }

    const description = normalizeText(cell(row, 'description'));
    const size = normalizeText(cell(row, 'size'));
    const unitText = cell(row, 'unit');
    const categoryText = cell(row, 'category');

    if (description === '' && size === '' && unitText === '' && categoryText === '') {
      continue;
    }

    rows.push({
      rowNumber: row.rowNumber,
      description,
      size,
      unitText,
      categoryText,
      unitId: null,
      categoryId: null,
      hsnCode: cell(row, 'hsn'),
      gstRate: cell(row, 'gst'),
      itemUse: 'STOCK_AND_ISSUE',
    });
  }

  return rows;
}
