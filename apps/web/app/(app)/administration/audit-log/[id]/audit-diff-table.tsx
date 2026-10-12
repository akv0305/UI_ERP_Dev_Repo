import { terminology } from '@/config/terminology';
import { buildAuditDiff, type Snapshot } from '@/lib/audit-diff';
import { cn } from '@/lib/utils';

export interface AuditDiffTableProps {
  before: Snapshot;
  after: Snapshot;
}

function fieldLabel(field: string): string {
  const labels = terminology.auditLog.fields as Record<string, string>;

  return labels[field] ?? field;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return terminology.auditLog.emptyValue;
  }

  if (typeof value === 'boolean') {
    return value ? terminology.labels.yes : terminology.labels.no;
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? terminology.auditLog.emptyValue : value.map(String).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/** Before/after values per field; changed fields use theme tokens (warning tint, strong text). */
export function AuditDiffTable({ before, after }: AuditDiffTableProps) {
  const rows = buildAuditDiff(before, after);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{terminology.auditLog.noChanges}</p>;
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-muted">
          <tr className="border-b border-border">
            {[
              terminology.auditLog.columnField,
              terminology.auditLog.columnBefore,
              terminology.auditLog.columnAfter,
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="h-[var(--row-height)] px-3 text-left text-xs font-medium uppercase text-muted-foreground"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.field}
              className={cn(
                'border-b border-border last:border-0',
                row.changed ? 'bg-warning/10' : undefined,
              )}
            >
              <th
                scope="row"
                className={cn(
                  'h-[var(--row-height)] px-3 text-left align-top font-medium text-foreground',
                )}
              >
                {fieldLabel(row.field)}
                {row.changed ? (
                  <span className="ml-2 rounded-full border border-warning/40 px-1.5 py-0.5 text-xs font-medium text-warning">
                    {terminology.auditLog.changedMarker}
                  </span>
                ) : null}
              </th>
              <td
                className={cn(
                  'px-3 align-top break-words',
                  row.changed ? 'text-danger' : 'text-muted-foreground',
                )}
              >
                {formatValue(row.before)}
              </td>
              <td
                className={cn(
                  'px-3 align-top break-words',
                  row.changed ? 'font-medium text-success' : 'text-muted-foreground',
                )}
              >
                {formatValue(row.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
