'use client';

import {
  ITEM_USES,
  type ItemListQuery,
  type ItemResponse,
  type PagedItemsResponse,
} from '@uie/contracts';
import {
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FieldOption,
  type FilterField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';
import { ACTIVE_FILTER_OPTIONS, ActiveStatus } from '../_components/active-status';
import { useMasterList } from '../_components/use-master-list';
import { ItemMasterTabs } from './_components/item-master-tabs';
import { ITEM_STATUS_FILTER_OPTIONS, ItemStatusChip } from './_components/item-status-chip';

const SORTABLE: Record<string, ItemListQuery['sortBy']> = {
  code: 'code',
  description: 'description',
};

const columns: DataTableColumn<ItemResponse>[] = [
  { accessorKey: 'code', header: terminology.items.columnCode },
  { accessorKey: 'description', header: terminology.items.columnDescription },
  {
    id: 'size',
    header: terminology.items.columnSize,
    enableSorting: false,
    cell: ({ row }) => row.original.size ?? terminology.labels.notSet,
  },
  {
    id: 'category',
    header: terminology.items.columnCategory,
    enableSorting: false,
    cell: ({ row }) => row.original.category.name,
  },
  {
    id: 'unit',
    header: terminology.items.columnUnit,
    enableSorting: false,
    cell: ({ row }) => row.original.unit.code,
  },
  {
    id: 'use',
    header: terminology.items.columnUse,
    enableSorting: false,
    cell: ({ row }) => terminology.items.uses[row.original.itemUse],
  },
  {
    id: 'approval',
    header: terminology.items.columnApproval,
    enableSorting: false,
    cell: ({ row }) => <ItemStatusChip status={row.original.status} />,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

const USE_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...ITEM_USES.map((use) => ({ value: use, label: terminology.items.uses[use] })),
];

export interface ItemsListClientProps {
  data: PagedItemsResponse;
  query: ItemListQuery;
  canManage: boolean;
  categoryOptions: FieldOption[];
  unitOptions: FieldOption[];
}

export function ItemsListClient({
  data,
  query,
  canManage,
  categoryOptions,
  unitOptions,
}: ItemsListClientProps) {
  const list = useMasterList({
    basePath: '/masters/items',
    query,
    initialFilters: {
      search: query.search ?? '',
      categoryId: query.categoryId ?? ALL_VALUE,
      unitId: query.unitId ?? ALL_VALUE,
      status: query.status ?? ALL_VALUE,
      itemUse: query.itemUse ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  const filterFields: FilterField[] = [
    { key: 'search', label: terminology.items.searchLabel, type: 'text' },
    ...(categoryOptions.length === 0
      ? []
      : [
          {
            key: 'categoryId',
            label: terminology.items.filterCategory,
            type: 'select' as const,
            options: [{ value: ALL_VALUE, label: terminology.filters.all }, ...categoryOptions],
          },
        ]),
    ...(unitOptions.length === 0
      ? []
      : [
          {
            key: 'unitId',
            label: terminology.items.filterUnit,
            type: 'select' as const,
            options: [{ value: ALL_VALUE, label: terminology.filters.all }, ...unitOptions],
          },
        ]),
    {
      key: 'status',
      label: terminology.items.filterApproval,
      type: 'select',
      options: ITEM_STATUS_FILTER_OPTIONS,
    },
    {
      key: 'itemUse',
      label: terminology.items.filterUse,
      type: 'select',
      options: USE_FILTER_OPTIONS,
    },
    {
      key: 'isActive',
      label: terminology.masters.statusFilter,
      type: 'select',
      options: ACTIVE_FILTER_OPTIONS,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.items}
        subtitle={terminology.itemMaster.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/masters/items/new')}>
              {terminology.items.newItem}
            </Button>
          ) : undefined
        }
      />
      <ItemMasterTabs />
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
        onRowClick={(item) => list.router.push(`/masters/items/${item.id}`)}
      />
    </div>
  );
}
