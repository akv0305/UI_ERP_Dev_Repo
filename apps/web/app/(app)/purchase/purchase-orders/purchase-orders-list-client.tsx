'use client';

import {
  PURCHASE_ORDER_SOURCES,
  type PagedPurchaseOrdersResponse,
  type PurchaseOrderListQuery,
  type PurchaseOrderResponse,
} from '@uie/contracts';
import {
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FilterField,
} from '@/components/erp';
import { terminology } from '@/config/terminology';
import { formatDate, formatINR } from '@/lib/format';
import { ALL_VALUE } from '@/lib/list-params';
import { useMasterList } from '../../masters/_components/use-master-list';
import {
  PURCHASE_ORDER_STATUS_FILTER_OPTIONS,
  PurchaseOrderStatusChip,
} from './_components/purchase-order-status-chip';
import { purchaseOrderTitle } from './_components/purchase-order-text';

const t = terminology.purchaseOrders;

const SORTABLE: Record<string, PurchaseOrderListQuery['sortBy']> = {
  number: 'number',
  poDate: 'poDate',
  grandTotal: 'grandTotal',
};

const SOURCE_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...PURCHASE_ORDER_SOURCES.map((source) => ({ value: source, label: t.sources[source] })),
];

const columns: DataTableColumn<PurchaseOrderResponse>[] = [
  { id: 'number', header: t.columnNumber, cell: ({ row }) => purchaseOrderTitle(row.original) },
  { id: 'poDate', header: t.columnDate, cell: ({ row }) => formatDate(row.original.poDate) },
  {
    id: 'source',
    header: t.columnSource,
    enableSorting: false,
    cell: ({ row }) => t.sources[row.original.source],
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
    id: 'lines',
    header: t.columnLines,
    enableSorting: false,
    cell: ({ row }) => row.original.lineCount,
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
    cell: ({ row }) => <PurchaseOrderStatusChip status={row.original.status} />,
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: t.searchLabel, type: 'text' },
  {
    key: 'status',
    label: t.filterStatus,
    type: 'select',
    options: PURCHASE_ORDER_STATUS_FILTER_OPTIONS,
  },
  { key: 'source', label: t.filterSource, type: 'select', options: SOURCE_FILTER_OPTIONS },
];

export interface PurchaseOrdersListClientProps {
  data: PagedPurchaseOrdersResponse;
  query: PurchaseOrderListQuery;
}

export function PurchaseOrdersListClient({ data, query }: PurchaseOrdersListClientProps) {
  const list = useMasterList({
    basePath: '/purchase/purchase-orders',
    query,
    initialFilters: {
      search: query.search ?? '',
      status: query.status ?? ALL_VALUE,
      source: query.source ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'createdAt',
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.nav.purchaseOrders} subtitle={t.subtitle} />
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
        onRowClick={(purchaseOrder) =>
          list.router.push(`/purchase/purchase-orders/${purchaseOrder.id}`)
        }
      />
    </div>
  );
}
