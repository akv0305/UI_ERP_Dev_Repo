'use client';

import type { EmployeeListQuery, EmployeeResponse, PagedEmployeesResponse } from '@uie/contracts';
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
import { useMasterList } from '@/app/(app)/masters/_components/use-master-list';
import { workLocationText } from './_components/employee-text';
import { EMPLOYMENT_FILTER_OPTIONS, EmploymentStatus } from './_components/employment-status';

const t = terminology.employees;

const SORTABLE: Record<string, EmployeeListQuery['sortBy']> = {
  employeeNo: 'employeeNo',
  code: 'code',
  fullName: 'fullName',
};

const columns: DataTableColumn<EmployeeResponse>[] = [
  { accessorKey: 'employeeNo', header: t.columnEmployeeNo },
  { accessorKey: 'code', header: t.columnCode },
  { accessorKey: 'fullName', header: t.columnName },
  {
    id: 'designation',
    header: t.columnDesignation,
    enableSorting: false,
    cell: ({ row }) => row.original.designation?.name ?? terminology.labels.notSet,
  },
  {
    id: 'company',
    header: t.columnCompany,
    enableSorting: false,
    cell: ({ row }) => row.original.company.code,
  },
  {
    id: 'workLocation',
    header: t.columnWorkLocation,
    enableSorting: false,
    cell: ({ row }) => workLocationText(row.original),
  },
  {
    id: 'employment',
    header: t.columnEmployment,
    enableSorting: false,
    cell: ({ row }) => <EmploymentStatus status={row.original.status} />,
  },
  {
    id: 'status',
    header: terminology.masters.columnStatus,
    enableSorting: false,
    cell: ({ row }) => <ActiveStatus isActive={row.original.isActive} />,
  },
];

export interface EmployeesListClientProps {
  data: PagedEmployeesResponse;
  query: EmployeeListQuery;
  canManage: boolean;
}

export function EmployeesListClient({ data, query, canManage }: EmployeesListClientProps) {
  const list = useMasterList({
    basePath: '/hr/employees',
    query,
    initialFilters: {
      search: query.search ?? '',
      status: query.status ?? ALL_VALUE,
      isActive: query.isActive ?? ALL_VALUE,
    },
    sortable: SORTABLE,
    defaultSortBy: 'employeeNo',
  });

  const filterFields: FilterField[] = [
    { key: 'search', label: t.searchLabel, type: 'text' },
    {
      key: 'status',
      label: t.filterEmployment,
      type: 'select',
      options: EMPLOYMENT_FILTER_OPTIONS,
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
        title={terminology.nav.employees}
        subtitle={t.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => list.router.push('/hr/employees/new')}>
              {t.newEmployee}
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
        onRowClick={(employee) => list.router.push(`/hr/employees/${employee.id}`)}
      />
    </div>
  );
}
