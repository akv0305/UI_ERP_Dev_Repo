'use client';

import type { SortingState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import {
  DataTable,
  FilterBar,
  StatusChip,
  type DataTableColumn,
  type FilterBarValue,
  type FilterField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { info as toastInfo } from '@/lib/toast';
import { GallerySection } from './gallery-section';
import { sampleLabels, sampleOptions, sampleRows, type SampleRow } from './sample-data';

const columns: DataTableColumn<SampleRow>[] = [
  { accessorKey: 'code', header: sampleLabels.code },
  { accessorKey: 'name', header: sampleLabels.name },
  {
    accessorKey: 'status',
    header: sampleLabels.status,
    cell: ({ row }) => <StatusChip status={row.original.status} />,
  },
  {
    accessorKey: 'quantity',
    header: sampleLabels.quantity,
    meta: { align: 'right' },
    cell: ({ getValue }) => formatQty(String(getValue()), 3),
  },
  {
    accessorKey: 'amount',
    header: sampleLabels.amount,
    meta: { align: 'right' },
    cell: ({ getValue }) => formatINR(String(getValue())),
  },
  {
    accessorKey: 'date',
    header: sampleLabels.date,
    cell: ({ getValue }) => formatDate(String(getValue())),
  },
];

const filterFields: FilterField[] = [
  { key: 'name', label: sampleLabels.filterName, type: 'text' },
  { key: 'status', label: sampleLabels.filterStatus, type: 'select', options: sampleOptions },
  { key: 'date', label: sampleLabels.filterDate, type: 'dateRange' },
];

const noop = () => {};

export function GalleryTableSection() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filterValue, setFilterValue] = useState<FilterBarValue>({});

  const sortedRows = useMemo(() => {
    const first = sorting[0];

    if (first === undefined) {
      return sampleRows;
    }

    const copy = [...sampleRows];
    copy.sort((left, right) => {
      const leftValue = String(left[first.id as keyof SampleRow]);
      const rightValue = String(right[first.id as keyof SampleRow]);
      const result = leftValue.localeCompare(rightValue, undefined, { numeric: true });

      return first.desc ? -result : result;
    });

    return copy;
  }, [sorting]);

  const pagedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-8">
      <GallerySection title={terminology.gallery.sectionTable}>
        <DataTable
          columns={columns}
          data={pagedRows}
          totalRows={sortedRows.length}
          page={page}
          pageSize={pageSize}
          sorting={sorting}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onSortingChange={setSorting}
          onRowClick={(row) => toastInfo(row.code)}
          rowActions={(row) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                toastInfo(row.code);
              }}
            >
              {terminology.actions.edit}
            </Button>
          )}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            page={1}
            pageSize={10}
            sorting={[]}
            onPageChange={noop}
            onPageSizeChange={noop}
            onSortingChange={noop}
            isLoading
          />
          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            page={1}
            pageSize={10}
            sorting={[]}
            onPageChange={noop}
            onPageSizeChange={noop}
            onSortingChange={noop}
            error={sampleLabels.errorDescription}
          />
        </div>
      </GallerySection>

      <GallerySection title={terminology.gallery.sectionFilters}>
        <FilterBar
          fields={filterFields}
          value={filterValue}
          onChange={setFilterValue}
          onReset={() => setFilterValue({})}
        />
      </GallerySection>
    </div>
  );
}
