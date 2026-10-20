'use client';

import {
  VENDOR_TYPES,
  type PagedVendorsResponse,
  type VendorListQuery,
  type VendorResponse,
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
import { ALL_VALUE } from '@/lib/list-params';
import { ACTIVE_FILTER_OPTIONS, ActiveStatus } from '../_components/active-status';
import { useMasterList } from '../_components/use-master-list';
import { VENDOR_STATUS_FILTER_OPTIONS, VendorStatusChip } from './_components/vendor-status-chip';

const t = terminology.vendors;

const SORTABLE: Record<string, VendorListQuery['sortBy']> = {
  code: 'code',
  legalName: 'legalName',
};

const columns: DataTableColumn<VendorResponse>[] = [
  { accessorKey: 'code', header: t.columnCode },
  { accessorKey: 'legalName', header: t.columnLegalName },
  {
    id: 'vendorType',
    header: t.columnType,
    enableSorting: false,
    cell: ({ row }) => t.types[row.original.vendorType],
  },
  {
    id: 'pan',
    header: t.columnPan,
    enableSorting: false,
    cell: ({ row }) => row.original.pan ?? terminology.labels.notSet,
  },
  {
    id: 'state',
    header: t.columnState,
    enableSorting: false,
    cell: ({ row }) => row.original.state?.name ?? terminology.labels.notSet,
  },
  {
    id: 'approval',
    header: t.columnApproval,
    enableSorting: false,
    cell: ({ row }) => <VendorStatusChip status={row.original.status} />,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: t.searchLabel, type: 'text' },
  {
    key: 'vendorType',
    label: t.filterType,
    type: 'select',
    options: [
      { value: ALL_VALUE, label: terminology.filters.all },
      ...VENDOR_TYPES.map((value) => ({ value, label: t.types[value] })),
    ],
  },
  {
    key: 'status',
    label: t.filterApproval,
    type: 'select',
    options: VENDOR_STATUS_FILTER_OPTIONS,
  },
  {
    key: 'isActive',
    label: terminology.masters.statusFilter,
    type: 'select',
    options: ACTIVE_FILTER_OPTIONS,
  },
];

export interface VendorsListClientProps {
  data: PagedVendorsResponse;
  query: VendorListQuery;
  canManage: boolean;
}

export function VendorsListClient({ data, query, canManage }: VendorsListClientProps) {
  const list = useMasterList({
    basePath: '/masters/vendors',
    query,
    initialFilters: {
      search: query.search ?? '',
      vendorType: query.vendorType ?? ALL_VALUE,
      status: query.status ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.vendors}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/masters/vendors/new')}>
              {t.newVendor}
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
        onRowClick={(vendor) => list.router.push(`/masters/vendors/${vendor.id}`)}
      />
    </div>
  );
}
