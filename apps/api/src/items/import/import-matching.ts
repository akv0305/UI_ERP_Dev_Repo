import {
  GST_RATE_PATTERN,
  HSN_PATTERN,
  ITEM_DESCRIPTION_MAX,
  ITEM_IMPORT_WARNING_CODES,
  ITEM_SIZE_MAX,
  MAX_GST_RATE,
  normalizeText,
  type ItemImportCheckResponse,
  type ItemImportIssue,
  type ItemImportIssueCode,
  type ItemImportRowInput,
  type ItemImportRowResult,
  type ItemImportUnmatched,
} from '@uie/contracts';

/** OQ-30 C: descriptions at least this alike (1 - edit distance / length) are flagged yellow. */
export const SIMILARITY_THRESHOLD = 0.85;

export interface UnitRef {
  id: string;
  code: string;
  name: string;
}

export interface CategoryRef {
  id: string;
  code: string;
  name: string;
}

export interface ExistingItemRef {
  code: string;
  description: string;
  size: string | null;
  unitId: string;
  categoryId: string;
}

/** Active units and categories (the only valid picks) and every saved item (for duplicates). */
export interface ImportRefs {
  units: readonly UnitRef[];
  categories: readonly CategoryRef[];
  items: readonly ExistingItemRef[];
}

/** Case, spaces, dots, apostrophes, a leading "per" and a trailing "s" are ignored: No's = Nos = NOS. */
export function unitKey(text: string): string {
  let key = text.toLowerCase().replace(/[\s.'’`-]/g, '');

  if (key.startsWith('per') && key.length > 3) {
    key = key.slice(3);
  }

  if (key.length > 1 && key.endsWith('s')) {
    key = key.slice(0, -1);
  }

  return key;
}

/** Same comparison as the item duplicate rule: whitespace collapsed, case ignored. */
export function textKey(text: string): string {
  return normalizeText(text).toLowerCase();
}

function duplicateKey(unitId: string, description: string, size: string): string {
  return `${unitId}|${textKey(description)}|${textKey(size)}`;
}

function similarityBucket(categoryId: string, size: string): string {
  return `${categoryId}|${textKey(size)}`;
}

/** key -> id; a key shared by two different records maps to null (ambiguous, so no match). */
function buildIndex<T extends { id: string }>(
  refs: readonly T[],
  keysOf: (ref: T) => string[],
): Map<string, string | null> {
  const index = new Map<string, string | null>();

  for (const ref of refs) {
    for (const key of new Set(keysOf(ref))) {
      if (key.length === 0) {
        continue;
      }

      const current = index.get(key);

      if (current === undefined) {
        index.set(key, ref.id);
      } else if (current !== ref.id) {
        index.set(key, null);
      }
    }
  }

  return index;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;

      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}

function numbersOf(text: string): string {
  return (text.match(/\d+/g) ?? []).join(' ');
}

/** Near-match but not identical, with the same numbers (so "Bolt 10mm" is not like "Bolt 12mm"). */
export function isSimilar(a: string, b: string): boolean {
  if (a === b || numbersOf(a) !== numbersOf(b)) {
    return false;
  }

  const longest = Math.max(a.length, b.length);

  if (longest === 0 || Math.abs(a.length - b.length) > longest * (1 - SIMILARITY_THRESHOLD)) {
    return false;
  }

  return 1 - levenshtein(a, b) / longest >= SIMILARITY_THRESHOLD;
}

/** The picked id if it is still active, else a match on the file's spelling. */
function resolve(
  pickedId: string | null,
  text: string,
  activeIds: ReadonlySet<string>,
  match: (text: string) => string | null,
): string | null {
  if (pickedId !== null) {
    return activeIds.has(pickedId) ? pickedId : null;
  }

  return text.trim() === '' ? null : match(text);
}

interface Bucketed {
  key: string;
  description: string;
}

/** Checks every row against the master and against earlier rows of the same file (PD-042). */
export function checkRows(
  rows: readonly ItemImportRowInput[],
  refs: ImportRefs,
): ItemImportRowResult[] {
  const unitIds = new Set(refs.units.map((unit) => unit.id));
  const categoryIds = new Set(refs.categories.map((category) => category.id));
  const unitIndex = buildIndex(refs.units, (unit) => [unitKey(unit.code), unitKey(unit.name)]);
  const categoryIndex = buildIndex(refs.categories, (category) => [
    textKey(category.name),
    textKey(category.code),
  ]);

  const existingByKey = new Map<string, ExistingItemRef>();
  const existingBuckets = new Map<string, (Bucketed & { code: string })[]>();

  for (const item of refs.items) {
    const key = duplicateKey(item.unitId, item.description, item.size ?? '');

    if (!existingByKey.has(key)) {
      existingByKey.set(key, item);
    }

    const bucketKey = similarityBucket(item.categoryId, item.size ?? '');
    const bucket = existingBuckets.get(bucketKey) ?? [];

    bucket.push({ key: textKey(item.description), description: item.description, code: item.code });
    existingBuckets.set(bucketKey, bucket);
  }

  const fileKeys = new Map<string, number>();
  const fileBuckets = new Map<string, (Bucketed & { rowNumber: number })[]>();

  return rows.map((row) => {
    const description = normalizeText(row.description);
    const size = normalizeText(row.size);
    const hsnCode = row.hsnCode.trim();
    const gstRate = row.gstRate.trim().replace(/\s*%$/, '');
    const issues: ItemImportIssue[] = [];
    const add = (
      code: ItemImportIssueCode,
      ref: { refCode?: string; refText?: string; refRow?: number } = {},
    ): void => {
      issues.push({
        code,
        severity: ITEM_IMPORT_WARNING_CODES.includes(code) ? 'warning' : 'error',
        refCode: ref.refCode ?? null,
        refText: ref.refText ?? null,
        refRow: ref.refRow ?? null,
      });
    };

    if (description === '') {
      add('DESCRIPTION_REQUIRED');
    } else if (description.length > ITEM_DESCRIPTION_MAX) {
      add('DESCRIPTION_TOO_LONG');
    }

    if (size.length > ITEM_SIZE_MAX) {
      add('SIZE_TOO_LONG');
    }

    const unitId = resolve(
      row.unitId,
      row.unitText,
      unitIds,
      (text) => unitIndex.get(unitKey(text)) ?? null,
    );

    if (unitId === null) {
      add(row.unitId === null && row.unitText.trim() === '' ? 'UNIT_REQUIRED' : 'UNIT_NOT_MATCHED');
    }

    const categoryId = resolve(
      row.categoryId,
      row.categoryText,
      categoryIds,
      (text) => categoryIndex.get(textKey(text)) ?? null,
    );

    if (categoryId === null) {
      add(
        row.categoryId === null && row.categoryText.trim() === ''
          ? 'CATEGORY_REQUIRED'
          : 'CATEGORY_NOT_MATCHED',
      );
    }

    if (hsnCode !== '' && !HSN_PATTERN.test(hsnCode)) {
      add('INVALID_HSN');
    }

    if (gstRate !== '' && (!GST_RATE_PATTERN.test(gstRate) || Number(gstRate) > MAX_GST_RATE)) {
      add('INVALID_GST_RATE');
    }

    let duplicate = false;

    if (unitId !== null && description !== '') {
      const key = duplicateKey(unitId, description, size);
      const existing = existingByKey.get(key);
      const firstRow = fileKeys.get(key);

      if (existing !== undefined) {
        add('DUPLICATE_EXISTING', { refCode: existing.code, refText: existing.description });
        duplicate = true;
      } else if (firstRow !== undefined) {
        add('DUPLICATE_IN_FILE', { refRow: firstRow });
        duplicate = true;
      } else {
        fileKeys.set(key, row.rowNumber);
      }
    }

    if (!duplicate && categoryId !== null && description !== '') {
      const bucketKey = similarityBucket(categoryId, size);
      const key = textKey(description);
      const similarItem = existingBuckets
        .get(bucketKey)
        ?.find((entry) => isSimilar(key, entry.key));

      if (similarItem !== undefined) {
        add('SIMILAR_EXISTING', { refCode: similarItem.code, refText: similarItem.description });
      } else {
        const bucket = fileBuckets.get(bucketKey) ?? [];
        const similarRow = bucket.find((entry) => isSimilar(key, entry.key));

        if (similarRow !== undefined) {
          add('SIMILAR_IN_FILE', { refRow: similarRow.rowNumber, refText: similarRow.description });
        }

        bucket.push({ key, description, rowNumber: row.rowNumber });
        fileBuckets.set(bucketKey, bucket);
      }
    }

    const status = issues.some((issue) => issue.severity === 'error')
      ? 'ERROR'
      : issues.length > 0
        ? 'WARNING'
        : 'READY';

    return {
      rowNumber: row.rowNumber,
      description,
      size,
      unitText: row.unitText.trim(),
      categoryText: row.categoryText.trim(),
      unitId,
      categoryId,
      hsnCode,
      gstRate,
      itemUse: row.itemUse,
      status,
      issues,
    };
  });
}

function unmatched(
  rows: readonly ItemImportRowResult[],
  code: ItemImportIssueCode,
  textOf: (row: ItemImportRowResult) => string,
): ItemImportUnmatched[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.issues.some((issue) => issue.code === code)) {
      const text = textOf(row);

      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([text, count]) => ({ text, rows: count }))
    .sort((a, b) => b.rows - a.rows || a.text.localeCompare(b.text));
}

export function summarise(rows: ItemImportRowResult[]): ItemImportCheckResponse {
  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter((row) => row.status === 'READY').length,
      warning: rows.filter((row) => row.status === 'WARNING').length,
      error: rows.filter((row) => row.status === 'ERROR').length,
    },
    unmatchedUnits: unmatched(rows, 'UNIT_NOT_MATCHED', (row) => row.unitText),
    unmatchedCategories: unmatched(rows, 'CATEGORY_NOT_MATCHED', (row) => row.categoryText),
  };
}
