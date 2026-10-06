import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function ItemsPage() {
  if (!(await requirePermission('masters.items.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.items} />;
}
