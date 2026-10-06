import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function IndentsPage() {
  if (!(await requirePermission('purchase.indents.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.indents} />;
}
