'use client';

import type { EnquiryListQuery, EnquiryResponse, PagedEnquiriesResponse } from '@uie/contracts';
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
import {
  ENQUIRY_STATUS_FILTER_OPTIONS,
  EnquiryStatusChip,
} from './_components/enquiry-status-chip';

const t = terminology.enquiries;

const SORTABLE: Record<string, EnquiryListQuery['sortBy']> = {
  number: 'number',
  enquiryDate: 'enquiryDate',
  quoteDueDate: 'quoteDueDate',
};

const columns: DataTableColumn<EnquiryResponse>[] = [
  {
    id: 'number',
    header: t.columnNumber,
    cell: ({ row }) => row.original.number ?? t.unnumbered,
  },
  {
    id: 'enquiryDate',
    header: t.columnDate,
    cell: ({ row }) => formatDate(row.original.enquiryDate),
  },
  {
    id: 'quoteDueDate',
    header: t.columnQuoteDue,
    cell: ({ row }) => formatDate(row.original.quoteDueDate),
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
  {
    id: 'vendorCount',
    header: t.columnVendors,
    enableSorting: false,
    cell: ({ row }) => String(row.original.vendorCount),
  },
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
    cell: ({ row }) => <EnquiryStatusChip status={row.original.status} />,
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: t.searchLabel, type: 'text' },
  { key: 'status', label: t.filterStatus, type: 'select', options: ENQUIRY_STATUS_FILTER_OPTIONS },
];

export interface EnquiriesListClientProps {
  data: PagedEnquiriesResponse;
  query: EnquiryListQuery;
  canManage: boolean;
}

export function EnquiriesListClient({ data, query, canManage }: EnquiriesListClientProps) {
  const list = useMasterList({
    basePath: '/purchase/enquiries',
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
        title={terminology.nav.enquiries}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/purchase/enquiries/new')}>
              {t.newEnquiry}
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
        onRowClick={(enquiry) => list.router.push(`/purchase/enquiries/${enquiry.id}`)}
      />
    </div>
  );
}
