'use client';

import {
  columnVisibilityFeature,
  functionalUpdate,
  metaHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingSkeleton } from './loading-skeleton';

export interface DataTableColumnMeta {
  align?: 'left' | 'center' | 'right';
}

const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof dataTableFeatures, TData>;

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  totalRows: number;
  page: number;
  pageSize: number;
  sorting: SortingState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortingChange: (sorting: SortingState) => void;
  isLoading?: boolean;
  error?: string | null;
  rowActions?: (row: TData) => ReactNode;
  onRowClick?: (row: TData) => void;
}

const ROW_FOCUS_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

function stopPropagation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function getColumnLabel(header: unknown, id: string): string {
  return typeof header === 'string' ? header : id;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  totalRows,
  page,
  pageSize,
  sorting,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
  isLoading = false,
  error = null,
  rowActions,
  onRowClick,
}: DataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    manualSorting: true,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => onSortingChange(functionalUpdate(updater, sorting)),
    onColumnVisibilityChange: setColumnVisibility,
  });

  if (isLoading) {
    return <LoadingSkeleton variant="table" />;
  }

  if (error !== null) {
    return <ErrorState description={error} />;
  }

  const rows = table.getRowModel().rows;

  // Enter/Space on the focused row activates it; keys pressed on controls inside the row do not.
  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, row: TData): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick?.(row);
    }
  }

  if (rows.length === 0) {
    return <EmptyState title={terminology.labels.noData} />;
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const hasActions = rowActions !== undefined;
  const pageLabel = `${terminology.table.page} ${currentPage} ${terminology.table.of} ${totalPages}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {terminology.table.columns}
              <ChevronDown className="size-4 opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{terminology.table.columns}</DropdownMenuLabel>
            {table.getAllLeafColumns().map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
              >
                {getColumnLabel(column.columnDef.header, column.id)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="hidden overflow-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const align = header.column.columnDef.meta?.align;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        'h-[var(--row-height)] px-3 text-left text-xs font-medium uppercase text-muted-foreground',
                        align === 'right' && 'text-right',
                        align === 'center' && 'text-center',
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-foreground',
                            align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
                {hasActions ? (
                  <th
                    scope="col"
                    className="h-[var(--row-height)] px-3 text-right text-xs font-medium uppercase text-muted-foreground"
                  >
                    {terminology.actions.actions}
                  </th>
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick ? (event) => handleRowKeyDown(event, row.original) : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  'border-b border-border last:border-0',
                  onRowClick
                    ? cn('cursor-pointer hover:bg-surface-muted', ROW_FOCUS_CLASSES)
                    : undefined,
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = cell.column.columnDef.meta?.align;

                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'h-[var(--row-height)] px-3 text-foreground',
                        align === 'right' && 'text-right tabular-nums',
                        align === 'center' && 'text-center',
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  );
                })}
                {hasActions ? (
                  <td
                    className="h-[var(--row-height)] px-3 text-right"
                    onClick={stopPropagation}
                    onKeyDown={stopPropagation}
                  >
                    {rowActions(row.original)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row.original) : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? 'button' : undefined}
            className={cn(
              'rounded-lg border border-border bg-surface p-[var(--card-padding)]',
              onRowClick
                ? cn('cursor-pointer hover:bg-surface-muted', ROW_FOCUS_CLASSES)
                : undefined,
            )}
          >
            <dl className="space-y-2">
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} className="flex items-start justify-between gap-3">
                  <dt className="text-xs font-medium uppercase text-muted-foreground">
                    {getColumnLabel(cell.column.columnDef.header, cell.column.id)}
                  </dt>
                  <dd className="text-right text-sm text-foreground">
                    <table.FlexRender cell={cell} />
                  </dd>
                </div>
              ))}
            </dl>
            {hasActions ? (
              <div
                className="mt-3 flex justify-end border-t border-border pt-3"
                onClick={stopPropagation}
                onKeyDown={stopPropagation}
              >
                {rowActions(row.original)}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-normal text-muted-foreground">
            {terminology.table.rowsPerPage}
          </Label>
          <Select value={String(pageSize)} onValueChange={(next) => onPageSizeChange(Number(next))}>
            <SelectTrigger className="w-20" aria-label={terminology.table.rowsPerPage}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {String(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{pageLabel}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label={terminology.table.previous}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label={terminology.table.next}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
