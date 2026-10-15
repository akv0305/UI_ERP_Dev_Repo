import { Injectable } from '@nestjs/common';
import {
  ITEM_IMPORT_MAX_ROWS,
  type ItemImportCheckRequest,
  type ItemImportCheckResponse,
  type ItemImportPreviewResponse,
} from '@uie/contracts';
import type { AccessContext } from '../../access/access-context';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCanManageItems } from '../item-access';
import { checkRows, summarise, type ImportRefs } from './import-matching';
import { extractRows, findHeader, type SheetData } from './import-sheet';
import { importHeaderNotFound, importNoRows, importTooManyRows } from './item-import-errors';

/** Preview and "check again" of an item import (PD-042). Nothing is written here. */
@Injectable()
export class ItemImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** The workbook is only read after the permission check, so `load` is passed in. */
  async preview(
    access: AccessContext,
    load: () => Promise<readonly SheetData[]>,
  ): Promise<ItemImportPreviewResponse> {
    assertCanManageItems(access);

    const header = findHeader(await load());

    if (header === null) {
      throw importHeaderNotFound();
    }

    const rows = extractRows(header);

    if (rows.length === 0) {
      throw importNoRows();
    }

    if (rows.length > ITEM_IMPORT_MAX_ROWS) {
      throw importTooManyRows();
    }

    return {
      sheetName: header.sheet.name,
      headerRowNumber: header.headerRowNumber,
      ...summarise(checkRows(rows, await this.loadRefs())),
    };
  }

  async check(
    request: ItemImportCheckRequest,
    access: AccessContext,
  ): Promise<ItemImportCheckResponse> {
    assertCanManageItems(access);

    return summarise(checkRows(request.rows, await this.loadRefs()));
  }

  /** Active units/categories are the valid picks; all items (any status) count for duplicates. */
  async loadRefs(): Promise<ImportRefs> {
    const [units, categories, items] = await Promise.all([
      this.prisma.unit.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.itemCategory.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.item.findMany({
        select: { code: true, description: true, size: true, unitId: true, categoryId: true },
      }),
    ]);

    return { units, categories, items };
  }
}
