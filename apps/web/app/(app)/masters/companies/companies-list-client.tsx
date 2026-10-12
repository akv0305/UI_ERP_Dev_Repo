'use client';

import {
  COMPANY_ENTITY_TYPES,
  type CompanyListQuery,
  type CompanyResponse,
  type PagedCompaniesResponse,
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
import { StatusToggle } from '../_components/status-toggle';
import { useMasterList } from '../_components/use-master-list';

const SORTABLE: Record<string, CompanyListQuery['sortBy']> = {
  code: 'code',
  legalName: 'legalName',
  entityType: 'entityType',
};

const columns: DataTableColumn<CompanyResponse>[] = [
  { accessorKey: 'code', header: terminology.companies.columnCode },
  { accessorKey: 'legalName', header: terminology.companies.columnLegalName },
  {
    accessorKey: 'entityType',
    header: terminology.companies.columnType,
    cell: ({ row }) => terminology.companies.entityTypes[row.original.entityType],
  },
  {
    id: 'pan',
    header: terminology.companies.columnPan,
    enableSorting: false,
    cell: ({ row }) => row.original.pan ?? terminology.labels.notSet,
  },
  {
    id: 'state',
    header: terminology.companies.columnState,
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

const filterFields: FilterField[] = [
  { key: 'search', label: terminology.companies.searchLabel, type: 'text' },
  {
    key: 'entityType',
    label: terminology.companies.typeFilter,
    type: 'select',
    options: [
      { value: ALL_VALUE, label: terminology.filters.all },
      ...COMPANY_ENTITY_TYPES.map((value) => ({
        value,
        label: terminology.companies.entityTypes[value],
      })),
    ],
  },
  {
    key: 'isActive',
    label: terminology.masters.statusFilter,
    type: 'select',
    options: ACTIVE_FILTER_OPTIONS,
  },
];

export interface CompaniesListClientProps {
  data: PagedCompaniesResponse;
  query: CompanyListQuery;
  canManage: boolean;
}

export function CompaniesListClient({ data, query, canManage }: CompaniesListClientProps) {
  const list = useMasterList({
    basePath: '/masters/companies',
    query,
    initialFilters: {
      search: query.search ?? '',
      entityType: query.entityType ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'code',
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.companies}
        subtitle={terminology.companies.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/masters/companies/new')}>
              {terminology.companies.newCompany}
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
        onRowClick={(company) => list.router.push(`/masters/companies/${company.id}`)}
        rowActions={
          canManage
            ? (company) =>
                company.canManage ? (
                  <StatusToggle
                    isActive={company.isActive}
                    path={`/api/companies/${company.id}`}
                    labels={terminology.companies}
                    onChanged={list.router.refresh}
                  />
                ) : null
            : undefined
        }
      />
    </div>
  );
}
