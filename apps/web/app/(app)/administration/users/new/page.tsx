import { RoleOptionsResponse, ScopeOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { UserForm } from '../user-form';

export default async function NewUserPage() {
  if (!(await requirePermission('administration.users.manage'))) {
    return <NotAuthorised />;
  }

  const [roles, scopes] = await Promise.all([
    apiGet('/api/users/role-options', RoleOptionsResponse),
    apiGet('/api/users/scope-options', ScopeOptionsResponse),
  ]);

  if (roles.kind !== 'ok') {
    return <ErrorState description={terminology.users.rolesUnavailable} />;
  }

  if (scopes.kind !== 'ok') {
    return <ErrorState description={terminology.users.scopeOptionsUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.users.newUser} />
      <UserForm roleOptions={roles.data.items} scopeOptions={scopes.data} />
    </div>
  );
}
