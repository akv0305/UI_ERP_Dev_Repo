'use client';

import type { SortingState } from '@tanstack/react-table';
import type { PagedUsersResponse, UserListQuery, UserResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  DataTable,
  FilterBar,
  PageHeader,
  type DataTableColumn,
  type FilterBarValue,
  type FilterField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDateTime } from '@/lib/format';
import { UserRowActions } from './user-row-actions';

const SEARCH_DEBOUNCE_MS = 400;
const ALL_VALUE = 'all';

const SORTABLE: Record<string, UserListQuery['sortBy']> = {
  username: 'username',
  displayName: 'displayName',
  email: 'email',
  lastLoginAt: 'lastLoginAt',
};

const columns: DataTableColumn<UserResponse>[] = [
  { accessorKey: 'username', header: terminology.users.columnUsername },
  { accessorKey: 'displayName', header: terminology.users.columnDisplayName },
  {
    accessorKey: 'email',
    header: terminology.users.columnEmail,
    cell: ({ row }) => row.original.email ?? '',
  },
  {
    id: 'roles',
    header: terminology.users.columnRoles,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.roles.length === 0
        ? terminology.users.noRoles
        : row.original.roles.map((role) => role.name).join(', '),
  },
  {
    id: 'status',
    header: terminology.users.columnStatus,
    enableSorting: false,
    cell: ({ row }) => (
      <span className={row.original.isActive ? 'text-success' : 'text-muted-foreground'}>
        {row.original.isActive ? terminology.labels.active : terminology.labels.inactive}
      </span>
    ),
  },
  {
    accessorKey: 'lastLoginAt',
    header: terminology.users.columnLastLogin,
    cell: ({ row }) =>
      row.original.lastLoginAt === null
        ? terminology.users.never
        : formatDateTime(row.original.lastLoginAt),
  },
];

const filterFields: FilterField[] = [
  { key: 'search', label: terminology.users.searchLabel, type: 'text' },
  {
    key: 'active',
    label: terminology.users.statusFilter,
    type: 'select',
    options: [
      { value: ALL_VALUE, label: terminology.filters.all },
      { value: 'true', label: terminology.labels.active },
      { value: 'false', label: terminology.labels.inactive },
    ],
  },
];

export interface UsersListClientProps {
  data: PagedUsersResponse;
  query: UserListQuery;
  canManage: boolean;
}

export function UsersListClient({ data, query, canManage }: UsersListClientProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterBarValue>({
    search: query.search ?? '',
    active: query.active ?? ALL_VALUE,
  });

  function navigate(next: Partial<UserListQuery>, values: FilterBarValue = filters): void {
    const merged = { ...query, ...next };
    const params = new URLSearchParams({
      page: String(merged.page),
      pageSize: String(merged.pageSize),
      sortBy: merged.sortBy,
      sortDir: merged.sortDir,
    });
    const search = (values.search ?? '').trim();
    const active = values.active ?? ALL_VALUE;

    if (search.length > 0) {
      params.set('search', search);
    }

    if (active !== ALL_VALUE && active.length > 0) {
      params.set('active', active);
    }

    router.push(`/administration/users?${params.toString()}`);
  }

  // Debounce typing in the search box; the URL (and so the server fetch) follows the filters.
  useEffect(() => {
    const currentSearch = (filters.search ?? '').trim();

    if (currentSearch === (query.search ?? '')) {
      return;
    }

    const timer = setTimeout(() => navigate({ page: 1 }), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filters.search]);

  const sorting: SortingState = [{ id: query.sortBy, desc: query.sortDir === 'desc' }];

  function handleSortingChange(next: SortingState): void {
    const first = next[0];
    const sortBy = first === undefined ? undefined : SORTABLE[first.id];

    if (first === undefined || sortBy === undefined) {
      navigate({ sortBy: 'username', sortDir: 'asc', page: 1 });
      return;
    }

    navigate({ sortBy, sortDir: first.desc ? 'desc' : 'asc', page: 1 });
  }

  function handleFilterChange(next: FilterBarValue): void {
    setFilters(next);

    if (next.active !== filters.active) {
      navigate({ page: 1 }, next);
    }
  }

  function handleReset(): void {
    const cleared = { search: '', active: ALL_VALUE };

    setFilters(cleared);
    navigate({ page: 1 }, cleared);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.users}
        subtitle={terminology.users.subtitle}
        actions={
          canManage ? (
            <Button type="button" onClick={() => router.push('/administration/users/new')}>
              {terminology.users.newUser}
            </Button>
          ) : undefined
        }
      />
      <FilterBar
        fields={filterFields}
        value={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
      />
      <DataTable
        columns={columns}
        data={data.items}
        totalRows={data.total}
        page={data.page}
        pageSize={data.pageSize}
        sorting={sorting}
        onPageChange={(page) => navigate({ page })}
        onPageSizeChange={(pageSize) => navigate({ pageSize, page: 1 })}
        onSortingChange={handleSortingChange}
        onRowClick={(user) => router.push(`/administration/users/${user.id}`)}
        rowActions={
          canManage
            ? (user) => <UserRowActions user={user} onChanged={router.refresh} />
            : undefined
        }
      />
    </div>
  );
}
