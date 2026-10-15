import * as ExcelJS from 'exceljs';
import { HEADER_SCAN_ROWS, type SheetData, type SheetRow } from './import-sheet';
import { importFileInvalid } from './item-import-errors';

const MAX_COLUMNS = 30;

type XlsxSource = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function cellText(cell: ExcelJS.Cell): string {
  try {
    return cell.text.trim();
  } catch {
    return '';
  }
}

/** Every sheet as display text (what the user sees in Excel), capped just above the row limit. */
export async function readWorkbook(buffer: Buffer, maxDataRows: number): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as XlsxSource);
  } catch {
    throw importFileInvalid();
  }

  const limit = maxDataRows + HEADER_SCAN_ROWS + 1;
  const sheets: SheetData[] = [];

  workbook.eachSheet((worksheet) => {
    const rows: SheetRow[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rows.length >= limit) {
        return;
      }

      const cells: string[] = [];
      const count = Math.min(row.cellCount, MAX_COLUMNS);

      for (let column = 1; column <= count; column += 1) {
        cells.push(cellText(row.getCell(column)));
      }

      rows.push({ rowNumber, cells });
    });

    sheets.push({ name: worksheet.name, rows });
  });

  return sheets;
}
