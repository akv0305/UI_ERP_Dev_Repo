import { RoleListResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { RolesListClient } from './roles-list-client';

export default async function RolesAndPermissionsPage() {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('administration.rolesAndPermissions.view')) {
    return <NotAuthorised />;
  }

  const result = await apiGet('/api/roles', RoleListResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.roles.loadError} />;
  }

  return (
    <RolesListClient
      roles={result.data.items}
      canManage={permissions.includes('administration.rolesAndPermissions.manage')}
    />
  );
}
