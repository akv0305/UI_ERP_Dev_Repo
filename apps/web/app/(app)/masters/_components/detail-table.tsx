import type { ReactNode } from 'react';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';

export interface DetailColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface DetailTableProps<T extends { id: string }> {
  columns: DetailColumn<T>[];
  rows: T[];
  /** Buttons for one row; when absent the Actions column is not shown. */
  actions?: (row: T) => ReactNode;
}

const HEADER_CLASS =
  'h-(--row-height) px-3 text-left text-xs font-medium uppercase text-muted-foreground';

/** Small table for child records on a detail page (GST rows, bank accounts, contacts). */
export function DetailTable<T extends { id: string }>({
  columns,
  rows,
  actions,
}: DetailTableProps<T>) {
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-muted">
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={HEADER_CLASS}>
                {column.header}
              </th>
            ))}
            {actions ? (
              <th scope="col" className={HEADER_CLASS}>
                {terminology.actions.actions}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn('h-(--row-height) px-3 text-foreground', column.className)}
                >
                  {column.cell(row)}
                </td>
              ))}
              {actions ? (
                <td className="px-3">
                  <div className="flex items-center gap-2">{actions(row)}</div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
