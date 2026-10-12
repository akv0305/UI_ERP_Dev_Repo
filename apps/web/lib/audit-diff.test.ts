import { describe, expect, it } from 'vitest';
import { buildAuditDiff } from './audit-diff';

describe('buildAuditDiff', () => {
  it('flags only the fields whose value differs', () => {
    const rows = buildAuditDiff({ name: 'A', city: 'X' }, { name: 'B', city: 'X' });

    expect(rows).toEqual([
      { field: 'name', before: 'A', after: 'B', changed: true },
      { field: 'city', before: 'X', after: 'X', changed: false },
    ]);
  });

  it('treats a create as every field changed from nothing', () => {
    const rows = buildAuditDiff(null, { code: 'UIE', isActive: true });

    expect(rows.every((row) => row.changed)).toBe(true);
    expect(rows.map((row) => row.field)).toEqual(['code', 'isActive']);
  });

  it('compares arrays and nested values by content', () => {
    const rows = buildAuditDiff({ roles: ['A', 'B'] }, { roles: ['A', 'B'], extra: null });

    expect(rows.find((row) => row.field === 'roles')?.changed).toBe(false);
    expect(rows.find((row) => row.field === 'extra')?.changed).toBe(false);
  });

  it('returns no rows when both snapshots are empty', () => {
    expect(buildAuditDiff(null, null)).toEqual([]);
  });
});
