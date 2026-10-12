export type Snapshot = Record<string, unknown> | null;

export interface AuditDiffRow {
  field: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** One row per field present in either snapshot, flagged when the value differs. */
export function buildAuditDiff(before: Snapshot, after: Snapshot): AuditDiffRow[] {
  const fields: string[] = [];

  for (const snapshot of [before, after]) {
    for (const key of Object.keys(snapshot ?? {})) {
      if (!fields.includes(key)) {
        fields.push(key);
      }
    }
  }

  return fields.map((field) => {
    const beforeValue = before?.[field];
    const afterValue = after?.[field];

    return {
      field,
      before: beforeValue,
      after: afterValue,
      changed: !sameValue(beforeValue, afterValue),
    };
  });
}
