'use client';

import type { PagedProjectsResponse, ProjectListQuery, ProjectResponse } from '@uie/contracts';
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

const SORTABLE: Record<string, ProjectListQuery['sortBy']> = {
  code: 'code',
  name: 'name',
};

const columns: DataTableColumn<ProjectResponse>[] = [
  { accessorKey: 'code', header: terminology.projects.columnCode },
  { accessorKey: 'name', header: terminology.projects.columnName },
  {
    id: 'company',
    header: terminology.projects.columnCompany,
    enableSorting: false,
    cell: ({ row }) => row.original.company.code,
  },
  {
    id: 'state',
    header: terminology.projects.columnState,
    enableSorting: false,
    cell: ({ row }) => row.original.state?.name ?? terminology.labels.notSet,
  },
  {
    id: 'billing',
    header: terminology.projects.columnBilling,
    enableSorting: false,
    cell: ({ row }) => row.original.billingGstRegistration?.gstin ?? terminology.labels.notSet,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

export interface ProjectsListClientProps {
  data: PagedProjectsResponse;
  query: ProjectListQuery;
  canManage: boolean;
  companyOptions: SelectOption[];
}

export function ProjectsListClient({
  data,
  query,
  canManage,
  companyOptions,
}: ProjectsListClientProps) {
  const list = useMasterList({
    basePath: '/masters/projects',
    query,
    initialFilters: {
      search: query.search ?? '',
      companyId: query.companyId ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  const filterFields: FilterField[] = [
    { key: 'search', label: terminology.projects.searchLabel, type: 'text' },
    ...(companyOptions.length === 0
      ? []
      : [
          {
            key: 'companyId',
            label: terminology.projects.companyFilter,
            type: 'select' as const,
            options: [{ value: ALL_VALUE, label: terminology.filters.all }, ...companyOptions],
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
        title={terminology.nav.projects}
        subtitle={terminology.projects.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/masters/projects/new')}>
              {terminology.projects.newProject}
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
        onRowClick={(project) => list.router.push(`/masters/projects/${project.id}`)}
        rowActions={
          canManage
            ? (project) => (
                <StatusToggle
                  isActive={project.isActive}
                  path={`/api/projects/${project.id}`}
                  labels={terminology.projects}
                  onChanged={list.router.refresh}
                />
              )
            : undefined
        }
      />
    </div>
  );
}
