import { RoleResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { RoleForm } from '../role-form';

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('administration.rolesAndPermissions.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/roles/${encodeURIComponent(id)}`, RoleResponse);

  if (result.kind === 'notFound') {
    return <ErrorState description={terminology.roles.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.roles.loadError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.roles.editRole}
        subtitle={`${result.data.name} (${result.data.code})`}
      />
      <RoleForm
        role={result.data}
        canManage={permissions.includes('administration.rolesAndPermissions.manage')}
      />
    </div>
  );
}
