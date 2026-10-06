import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function WbsPage() {
  if (!(await requirePermission('planning.wbs.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.wbs} />;
}
