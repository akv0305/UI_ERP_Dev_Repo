'use client';

import type {
  DesignationListQuery,
  DesignationResponse,
  PagedDesignationsResponse,
} from '@uie/contracts';
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
import { ACTIVE_FILTER_OPTIONS, ActiveStatus } from '@/app/(app)/masters/_components/active-status';
import { StatusToggle } from '@/app/(app)/masters/_components/status-toggle';
import { useMasterList } from '@/app/(app)/masters/_components/use-master-list';
import { DesignationDialog } from './designation-dialog';

const SORTABLE: Record<string, DesignationListQuery['sortBy']> = {
  code: 'code',
  name: 'name',
};

const columns: DataTableColumn<DesignationResponse>[] = [
  { accessorKey: 'code', header: terminology.designations.columnCode },
  { accessorKey: 'name', header: terminology.designations.columnName },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

export interface DesignationsListClientProps {
  data: PagedDesignationsResponse;
  query: DesignationListQuery;
  canManage: boolean;
}

export function DesignationsListClient({ data, query, canManage }: DesignationsListClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DesignationResponse | undefined>(undefined);
  const list = useMasterList({
    basePath: '/hr/designations',
    query,
    initialFilters: {
      search: query.search ?? '',
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  function openDialog(designation?: DesignationResponse): void {
    setEditing(designation);
    setDialogOpen(true);
  }

  const filterFields: FilterField[] = [
    { key: 'search', label: terminology.designations.searchLabel, type: 'text' },
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
        title={terminology.nav.designations}
        subtitle={terminology.designations.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => openDialog()}>
              {terminology.designations.newDesignation}
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
        rowActions={
          canManage
            ? (designation) =>
                designation.canManage ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog(designation)}
                    >
                      {terminology.actions.edit}
                    </Button>
                    <StatusToggle
                      isActive={designation.isActive}
                      path={`/api/designations/${designation.id}`}
                      labels={terminology.designations}
                      onChanged={list.router.refresh}
                    />
                  </div>
                ) : null
            : undefined
        }
      />
      {canManage ? (
        <DesignationDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          designation={editing}
          onSaved={list.router.refresh}
        />
      ) : null}
    </div>
  );
}
