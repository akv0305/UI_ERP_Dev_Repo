import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function UsersPage() {
  if (!(await requirePermission('administration.users.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.users} />;
}
