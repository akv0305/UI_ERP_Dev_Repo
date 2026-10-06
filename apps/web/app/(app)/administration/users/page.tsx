import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function UsersPage() {
  if (!requirePermission('administration.users.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.users} />;
}
