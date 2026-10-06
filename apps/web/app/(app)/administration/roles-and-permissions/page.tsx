import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function RolesAndPermissionsPage() {
  if (!requirePermission('administration.rolesAndPermissions.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.rolesAndPermissions} />;
}
