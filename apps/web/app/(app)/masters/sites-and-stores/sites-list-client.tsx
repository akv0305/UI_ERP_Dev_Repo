'use client';

import type { PagedSitesResponse, SiteListQuery, SiteResponse } from '@uie/contracts';
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
import type { SelectOption } from '@/lib/state-options';
import { ACTIVE_FILTER_OPTIONS, ActiveStatus } from '../_components/active-status';
import { StatusToggle } from '../_components/status-toggle';
import { useMasterList } from '../_components/use-master-list';

const SORTABLE: Record<string, SiteListQuery['sortBy']> = {
  code: 'code',
  name: 'name',
};

const columns: DataTableColumn<SiteResponse>[] = [
  { accessorKey: 'code', header: terminology.sites.columnCode },
  { accessorKey: 'name', header: terminology.sites.columnName },
  {
    id: 'project',
    header: terminology.sites.columnProject,
    enableSorting: false,
    cell: ({ row }) => row.original.project.code,
  },
  {
    id: 'city',
    header: terminology.sites.columnCity,
    enableSorting: false,
    cell: ({ row }) => row.original.city ?? terminology.labels.notSet,
  },
  {
    id: 'state',
    header: terminology.sites.columnState,
    enableSorting: false,
    cell: ({ row }) => row.original.state?.name ?? terminology.labels.notSet,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

export interface SitesListClientProps {
  data: PagedSitesResponse;
  query: SiteListQuery;
  canManage: boolean;
  projectOptions: SelectOption[];
}

export function SitesListClient({ data, query, canManage, projectOptions }: SitesListClientProps) {
  const list = useMasterList({
    basePath: '/masters/sites-and-stores',
    query,
    initialFilters: {
      search: query.search ?? '',
      projectId: query.projectId ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  const filterFields: FilterField[] = [
    { key: 'search', label: terminology.sites.searchLabel, type: 'text' },
    ...(projectOptions.length === 0
      ? []
      : [
          {
            key: 'projectId',
            label: terminology.sites.projectFilter,
            type: 'select' as const,
            options: [{ value: ALL_VALUE, label: terminology.filters.all }, ...projectOptions],
          },
        ]),
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
        title={terminology.nav.sitesAndStores}
        subtitle={terminology.sites.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/masters/sites-and-stores/new')}>
              {terminology.sites.newSite}
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
        onRowClick={(site) => list.router.push(`/masters/sites-and-stores/${site.id}`)}
        rowActions={
          canManage
            ? (site) =>
                site.canManage ? (
                  <StatusToggle
                    isActive={site.isActive}
                    path={`/api/sites/${site.id}`}
                    labels={terminology.sites}
                    onChanged={list.router.refresh}
                  />
                ) : null
            : undefined
        }
      />
    </div>
  );
}
