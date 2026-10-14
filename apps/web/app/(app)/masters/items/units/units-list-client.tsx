'use client';

import type { PagedUnitsResponse, UnitListQuery, UnitResponse } from '@uie/contracts';
import { useState } from 'react';
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
import { ACTIVE_FILTER_OPTIONS, ActiveStatus } from '../../_components/active-status';
import { StatusToggle } from '../../_components/status-toggle';
import { useMasterList } from '../../_components/use-master-list';
import { ItemMasterTabs } from '../_components/item-master-tabs';
import { UnitDialog } from './unit-dialog';

const SORTABLE: Record<string, UnitListQuery['sortBy']> = {
  code: 'code',
  name: 'name',
};

const columns: DataTableColumn<UnitResponse>[] = [
  { accessorKey: 'code', header: terminology.units.columnCode },
  { accessorKey: 'name', header: terminology.units.columnName },
  {
    accessorKey: 'decimalPlaces',
    header: terminology.units.columnDecimals,
    enableSorting: false,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

export interface UnitsListClientProps {
  data: PagedUnitsResponse;
  query: UnitListQuery;
  canManage: boolean;
}

export function UnitsListClient({ data, query, canManage }: UnitsListClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UnitResponse | undefined>(undefined);
  const list = useMasterList({
    basePath: '/masters/items/units',
    query,
    initialFilters: {
      search: query.search ?? '',
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  function openDialog(unit?: UnitResponse): void {
    setEditing(unit);
    setDialogOpen(true);
  }

  const filterFields: FilterField[] = [
    { key: 'search', label: terminology.units.searchLabel, type: 'text' },
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
            <Button type="button" onClick={() => openDialog()}>
              {terminology.units.newUnit}
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
        rowActions={
          canManage
            ? (unit) =>
                unit.canManage ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog(unit)}
                    >
                      {terminology.actions.edit}
                    </Button>
                    <StatusToggle
                      isActive={unit.isActive}
                      path={`/api/units/${unit.id}`}
                      labels={terminology.units}
                      onChanged={list.router.refresh}
                    />
                  </div>
                ) : null
            : undefined
        }
      />
      {canManage ? (
        <UnitDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          unit={editing}
          onSaved={list.router.refresh}
        />
      ) : null}
    </div>
  );
}
