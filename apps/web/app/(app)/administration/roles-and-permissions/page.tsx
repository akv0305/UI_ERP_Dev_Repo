import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function RolesAndPermissionsPage() {
  return (
    <PendingScreen
      title={terminology.nav.rolesAndPermissions}
      permission="administration.rolesAndPermissions.view"
    />
  );
}
