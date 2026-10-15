import { Prisma } from '@prisma/client';
import {
  CATEGORY_CODE_DIGITS,
  CATEGORY_CODE_PREFIX,
  ITEM_CODE_DIGITS,
  ITEM_CODE_PREFIX,
  formatMasterCode,
} from '@uie/contracts';

/** One gap-free code series (PD-041): next code = highest saved number + 1. */
export interface CodeSeries {
  /** Key of the transaction-level advisory lock that serialises this series. */
  lockKey: number;
  /** Table holding the codes (a fixed constant, never user input). */
  table: string;
  prefix: string;
  digits: number;
}

export const ITEM_CATEGORY_SERIES: CodeSeries = {
  lockKey: 50_001,
  table: 'item_categories',
  prefix: CATEGORY_CODE_PREFIX,
  digits: CATEGORY_CODE_DIGITS,
};

export const ITEM_SERIES: CodeSeries = {
  lockKey: 50_002,
  table: 'items',
  prefix: ITEM_CODE_PREFIX,
  digits: ITEM_CODE_DIGITS,
};

/** The part of a Prisma transaction client the code series needs. */
export type CodeSeriesTx = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/**
 * Serialises writes to the series until the surrounding transaction ends. Taking it twice in one
 * transaction is harmless. Also used by item edits so the duplicate check cannot race.
 */
export async function lockSeries(tx: CodeSeriesTx, series: CodeSeries): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${series.lockKey}::bigint)`;
}

/**
 * Next free number of the series (highest saved + 1). MUST run inside the transaction that inserts
 * the record(s): the lock is held until that transaction commits or rolls back, so concurrent saves
 * wait their turn and a failed save leaves no gap. A bulk insert uses number, number + 1, ...
 */
export async function nextNumber(tx: CodeSeriesTx, series: CodeSeries): Promise<number> {
  await lockSeries(tx, series);

  const pattern = `^${series.prefix}[0-9]+$`;
  const numberStart = series.prefix.length + 1;
  const rows = await tx.$queryRaw<{ last: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("code" FROM ${numberStart}::int) AS INTEGER))::int AS "last"
    FROM ${Prisma.raw(`"${series.table}"`)}
    WHERE "code" ~ ${pattern}`;

  return (rows[0]?.last ?? 0) + 1;
}

/** Next code of the series, e.g. ITM-000012. Same transaction rule as nextNumber. */
export async function nextCode(tx: CodeSeriesTx, series: CodeSeries): Promise<string> {
  return formatMasterCode(series.prefix, series.digits, await nextNumber(tx, series));
}
