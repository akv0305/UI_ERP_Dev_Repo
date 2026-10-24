'use client';

import type { IndentListQuery, IndentResponse, PagedIndentsResponse } from '@uie/contracts';
import {
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FilterField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDate } from '@/lib/format';
import { ALL_VALUE } from '@/lib/list-params';
import { useMasterList } from '../../masters/_components/use-master-list';
import { INDENT_STATUS_FILTER_OPTIONS, IndentStatusChip } from './_components/indent-status-chip';

const t = terminology.indents;

const SORTABLE: Record<string, IndentListQuery['sortBy']> = {
  number: 'number',
  indentDate: 'indentDate',
};

const columns: DataTableColumn<IndentResponse>[] = [
  {
    id: 'number',
    header: t.columnNumber,
    cell: ({ row }) => row.original.number ?? t.unnumbered,
  },
  {
    id: 'indentDate',
    header: t.columnDate,
    cell: ({ row }) => formatDate(row.original.indentDate),
  },
  {
    id: 'project',
    header: t.columnProject,
    enableSorting: false,
    cell: ({ row }) => row.original.project.code,
  },
  {
    id: 'site',
    header: t.columnSite,
    enableSorting: false,
    cell: ({ row }) => row.original.site.code,
  },
  { accessorKey: 'requestedBy', header: t.columnRequestedBy, enableSorting: false },
  {
    id: 'lineCount',
    header: t.columnLines,
    enableSorting: false,
    cell: ({ row }) => String(row.original.lineCount),
  },
  {
    id: 'status',
    header: t.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <IndentStatusChip status={row.original.status} />,
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: t.searchLabel, type: 'text' },
  { key: 'status', label: t.filterStatus, type: 'select', options: INDENT_STATUS_FILTER_OPTIONS },
];

export interface IndentsListClientProps {
  data: PagedIndentsResponse;
  query: IndentListQuery;
  canManage: boolean;
}

export function IndentsListClient({ data, query, canManage }: IndentsListClientProps) {
  const list = useMasterList({
    basePath: '/purchase/indents',
    query,
    initialFilters: {
      search: query.search ?? '',
      status: query.status ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'createdAt',
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.indents}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/purchase/indents/new')}>
              {t.newIndent}
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
        onRowClick={(indent) => list.router.push(`/purchase/indents/${indent.id}`)}
      />
    </div>
  );
}
