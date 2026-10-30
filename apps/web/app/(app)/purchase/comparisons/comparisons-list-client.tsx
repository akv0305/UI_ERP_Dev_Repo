'use client';

import type {
  ComparisonListQuery,
  ComparisonResponse,
  PagedComparisonsResponse,
} from '@uie/contracts';
import {
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FilterField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDate, formatINR } from '@/lib/format';
import { ALL_VALUE } from '@/lib/list-params';
import { useMasterList } from '../../masters/_components/use-master-list';
import {
  COMPARISON_STATUS_FILTER_OPTIONS,
  ComparisonStatusChip,
} from './_components/comparison-status-chip';
import { chosenCount, comparisonTitle } from './_components/comparison-text';

const t = terminology.comparisons;

const SORTABLE: Record<string, ComparisonListQuery['sortBy']> = {
  number: 'number',
  comparisonDate: 'comparisonDate',
};

const columns: DataTableColumn<ComparisonResponse>[] = [
  { id: 'number', header: t.columnNumber, cell: ({ row }) => comparisonTitle(row.original) },
  {
    id: 'comparisonDate',
    header: t.columnDate,
    cell: ({ row }) => formatDate(row.original.comparisonDate),
  },
  {
    id: 'enquiry',
    header: t.columnEnquiry,
    enableSorting: false,
    cell: ({ row }) => row.original.enquiry.number,
  },
  {
    id: 'project',
    header: t.columnProject,
    enableSorting: false,
    cell: ({ row }) => row.original.project.code,
  },
  {
    id: 'chosenLines',
    header: t.columnChosenLines,
    enableSorting: false,
    cell: ({ row }) => chosenCount(row.original.selectedLineCount, row.original.lineCount),
  },
  {
    id: 'selectedValue',
    header: t.columnSelectedValue,
    enableSorting: false,
    cell: ({ row }) => formatINR(row.original.selectedValue),
  },
  {
    id: 'status',
    header: t.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ComparisonStatusChip status={row.original.status} />,
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: t.searchLabel, type: 'text' },
  {
    key: 'status',
    label: t.filterStatus,
    type: 'select',
    options: COMPARISON_STATUS_FILTER_OPTIONS,
  },
];

export interface ComparisonsListClientProps {
  data: PagedComparisonsResponse;
  query: ComparisonListQuery;
  canManage: boolean;
}

export function ComparisonsListClient({ data, query, canManage }: ComparisonsListClientProps) {
  const list = useMasterList({
    basePath: '/purchase/comparisons',
    query,
    initialFilters: { search: query.search ?? '', status: query.status ?? ALL_VALUE },
    sortable: SORTABLE,
    defaultSortBy: 'createdAt',
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.comparisons}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/purchase/comparisons/new')}>
              {t.newComparison}
            </Button>
          ) : undefined
        }
      />
      <FilterBar
        fields={filterFields}
        value={list.filters}
        onChange={list.handleFilterChange}
        onReset={list.handleReset}
      />
      <DataTable
        columns={columns}
        data={data.items}
        totalRows={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sorting={list.sorting}
        onPageChange={(page) => list.navigate({ page })}
        onPageSizeChange={(pageSize) => list.navigate({ pageSize, page: 1 })}
        onSortingChange={list.handleSortingChange}
        onRowClick={(comparison) => list.router.push(`/purchase/comparisons/${comparison.id}`)}
      />
    </div>
  );
}
