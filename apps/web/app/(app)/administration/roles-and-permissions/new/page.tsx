import { NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';
import { RoleForm } from '../role-form';

export default async function NewRolePage() {
  if (!(await requirePermission('administration.rolesAndPermissions.manage'))) {
    return <NotAuthorised />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.roles.newRole} />
      <RoleForm canManage />
    </div>
  );
}
