import { RoleOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { UserForm } from '../user-form';

export default async function NewUserPage() {
  if (!(await requirePermission('administration.users.manage'))) {
    return <NotAuthorised />;
  }

  const roles = await apiGet('/api/users/role-options', RoleOptionsResponse);

  if (roles.kind !== 'ok') {
    return <ErrorState description={terminology.users.rolesUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.users.newUser} />
      <UserForm roleOptions={roles.data.items} />
    </div>
  );
}
