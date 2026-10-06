'use client';

import type { SortingState } from '@tanstack/react-table';
import { ALL_PERMISSIONS, type RoleResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { DataTable, PageHeader, type DataTableColumn } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';

const columns: DataTableColumn<RoleResponse>[] = [
  { accessorKey: 'code', header: terminology.roles.columnCode, enableSorting: false },
  { accessorKey: 'name', header: terminology.roles.columnName, enableSorting: false },
  {
    id: 'type',
    header: terminology.roles.columnType,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.isSystem ? terminology.roles.typeSystem : terminology.roles.typeCustom,
  },
  {
    id: 'status',
    header: terminology.roles.columnStatus,
    enableSorting: false,
    cell: ({ row }) => (
      <span className={row.original.isActive ? 'text-success' : 'text-muted-foreground'}>
        {row.original.isActive ? terminology.labels.active : terminology.labels.inactive}
      </span>
    ),
  },
  {
    accessorKey: 'userCount',
    header: terminology.roles.columnUsers,
    enableSorting: false,
    meta: { align: 'right' },
  },
  {
    id: 'permissions',
    header: terminology.roles.columnPermissions,
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) =>
      row.original.permissionCodes.length === ALL_PERMISSIONS.length
        ? terminology.roles.allPermissions
        : String(row.original.permissionCodes.length),
  },
];

const NO_SORTING: SortingState = [];

export interface RolesListClientProps {
  roles: RoleResponse[];
  canManage: boolean;
}

export function RolesListClient({ roles, canManage }: RolesListClientProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.nav.rolesAndPermissions}
        subtitle={terminology.roles.subtitle}
        actions={
          canManage ? (
            <Button
              type="button"
              onClick={() => router.push('/administration/roles-and-permissions/new')}
            >
              {terminology.roles.newRole}
            </Button>
          ) : undefined
        }
      />
      {/* The role list is small, so it is returned whole and shown on a single page. */}
      <DataTable
        columns={columns}
        data={roles}
        totalRows={roles.length}
        page={1}
        pageSize={Math.max(roles.length, 1)}
        sorting={NO_SORTING}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onSortingChange={() => undefined}
        onRowClick={(role) => router.push(`/administration/roles-and-permissions/${role.id}`)}
      />
    </div>
  );
}
