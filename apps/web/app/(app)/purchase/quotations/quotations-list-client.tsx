'use client';

import type {
  PagedQuotationsResponse,
  QuotationListQuery,
  QuotationResponse,
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
  QUOTATION_STATUS_FILTER_OPTIONS,
  QuotationStatusChip,
} from './_components/quotation-status-chip';
import { quotationTitle, quotedCount } from './_components/quotation-text';

const t = terminology.quotations;

const SORTABLE: Record<string, QuotationListQuery['sortBy']> = {
  number: 'number',
  quoteDate: 'quoteDate',
  grandTotal: 'grandTotal',
};

const columns: DataTableColumn<QuotationResponse>[] = [
  {
    id: 'number',
    header: t.columnNumber,
    cell: ({ row }) => quotationTitle(row.original, t.unnumbered),
  },
  {
    id: 'quoteDate',
    header: t.columnDate,
    cell: ({ row }) => formatDate(row.original.quoteDate),
  },
  {
    id: 'enquiry',
    header: t.columnEnquiry,
    enableSorting: false,
    cell: ({ row }) => row.original.enquiry.number,
  },
  {
    id: 'vendor',
    header: t.columnVendor,
    enableSorting: false,
    cell: ({ row }) => row.original.vendor.code,
  },
  {
    id: 'project',
    header: t.columnProject,
    enableSorting: false,
    cell: ({ row }) => row.original.project.code,
  },
  {
    id: 'quotedLines',
    header: t.columnQuotedLines,
    enableSorting: false,
    cell: ({ row }) => quotedCount(row.original.quotedLineCount, row.original.lineCount),
  },
  {
    id: 'grandTotal',
    header: t.columnGrandTotal,
    cell: ({ row }) => formatINR(row.original.grandTotal),
  },
  {
    id: 'status',
    header: t.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <QuotationStatusChip status={row.original.status} />,
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: t.searchLabel, type: 'text' },
  {
    key: 'status',
    label: t.filterStatus,
    type: 'select',
    options: QUOTATION_STATUS_FILTER_OPTIONS,
  },
];

export interface QuotationsListClientProps {
  data: PagedQuotationsResponse;
  query: QuotationListQuery;
  canManage: boolean;
}

export function QuotationsListClient({ data, query, canManage }: QuotationsListClientProps) {
  const list = useMasterList({
    basePath: '/purchase/quotations',
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
        title={terminology.nav.quotations}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/purchase/quotations/new')}>
              {t.newQuotation}
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
        onRowClick={(quotation) => list.router.push(`/purchase/quotations/${quotation.id}`)}
      />
    </div>
  );
}
