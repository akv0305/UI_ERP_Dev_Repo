import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ITEM_CODE_DIGITS,
  ITEM_CODE_PREFIX,
  ITEM_IMPORT_MAX_ROWS,
  formatMasterCode,
  type ItemImportCheckRequest,
  type ItemImportCheckResponse,
  type ItemImportCommitResponse,
  type ItemImportPreviewResponse,
  type ItemImportRowResult,
} from '@uie/contracts';
import type { AccessContext } from '../../access/access-context';
import { AuditService, type AuditRecordInput } from '../../audit/audit.service';
import { codeLabel } from '../../auth/auth.mapper';
import { ITEM_SERIES, lockSeries, nextNumber } from '../../masters/code-series';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCanManageItems } from '../item-access';
import { checkRows, summarise, type ImportRefs } from './import-matching';
import { extractRows, findHeader, type SheetData } from './import-sheet';
import { importHeaderNotFound, importNoRows, importTooManyRows } from './item-import-errors';

/** Up to 2,000 rows go in one transaction, so it gets more time than Prisma's default 5 s. */
const IMPORT_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

type RefsClient = Pick<Prisma.TransactionClient, 'unit' | 'itemCategory' | 'item'>;

/** A row that passed the check: unit and category resolved and no red issue. */
type ImportableRow = ItemImportRowResult & { unitId: string; categoryId: string };

function isImportable(row: ItemImportRowResult): row is ImportableRow {
  return row.status !== 'ERROR' && row.unitId !== null && row.categoryId !== null;
}

function orNull(value: string): string | null {
  return value === '' ? null : value;
}

/** Preview, "check again" and import of items from Excel (PD-042). No file is ever stored. */
@Injectable()
export class ItemImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  /**
   * Imports the grid. Every row is checked again inside the transaction, under the item code
   * lock, so a duplicate saved meanwhile is still caught. Red rows are skipped; the rest become
   * Pending approval with gap-free codes in file order, each with its own Audit Log entry.
   */
  async commit(
    request: ItemImportCheckRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<ItemImportCommitResponse> {
    assertCanManageItems(access);

    return this.prisma.$transaction(async (tx) => {
      await lockSeries(tx, ITEM_SERIES);

      const refs = await this.loadRefs(tx);
      const checked = checkRows(request.rows, refs);
      const first = await nextNumber(tx, ITEM_SERIES);
      const records = checked.filter(isImportable).map((row, index) => ({
        row,
        id: randomUUID(),
        code: formatMasterCode(ITEM_CODE_PREFIX, ITEM_CODE_DIGITS, first + index),
      }));

      if (records.length > 0) {
        const now = new Date();
        const units = new Map(refs.units.map((unit) => [unit.id, unit]));
        const categories = new Map(refs.categories.map((category) => [category.id, category]));

        await tx.item.createMany({
          data: records.map(({ row, id, code }): Prisma.ItemCreateManyInput => ({
            id,
            code,
            description: row.description,
            size: orNull(row.size),
            categoryId: row.categoryId,
            unitId: row.unitId,
            itemUse: 'STOCK_AND_ISSUE',
            hsnCode: orNull(row.hsnCode),
            gstRate: orNull(row.gstRate),
            status: 'PENDING_APPROVAL',
            submittedAt: now,
            submittedById: actorId,
            createdById: actorId,
            updatedById: actorId,
          })),
        });

        await this.audit.recordMany(
          tx,
          records.map(({ row, id, code }): AuditRecordInput => {
            const category = categories.get(row.categoryId);
            const gstRate = orNull(row.gstRate);

            return {
              actorUserId: actorId,
              action: 'CREATE',
              entityType: 'Item',
              entityId: id,
              before: null,
              after: {
                code,
                description: row.description,
                size: orNull(row.size),
                category:
                  category === undefined ? row.categoryId : codeLabel(category.code, category.name),
                unit: units.get(row.unitId)?.code ?? row.unitId,
                itemUse: 'STOCK_AND_ISSUE',
                hsnCode: orNull(row.hsnCode),
                gstRate: gstRate === null ? null : Number(gstRate).toFixed(2),
                remarks: null,
                status: 'PENDING_APPROVAL',
                decisionRemarks: null,
                isActive: true,
              },
            };
          }),
        );
      }

      const codes = new Map(records.map((record) => [record.row.rowNumber, record.code]));

      return {
        imported: records.length,
        skipped: checked.length - records.length,
        firstCode: records[0]?.code ?? null,
        lastCode: records[records.length - 1]?.code ?? null,
        rows: checked.map((row) => ({
          rowNumber: row.rowNumber,
          code: codes.get(row.rowNumber) ?? null,
          issues: row.issues,
        })),
      };
    }, IMPORT_TX_OPTIONS);
  }

  /** Active units/categories are the valid picks; all items (any status) count for duplicates. */
  async loadRefs(client: RefsClient = this.prisma): Promise<ImportRefs> {
    const [units, categories, items] = await Promise.all([
      client.unit.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      }),
      client.itemCategory.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      }),
      client.item.findMany({
        select: { code: true, description: true, size: true, unitId: true, categoryId: true },
      }),
    ]);

    return { units, categories, items };
  }
}
