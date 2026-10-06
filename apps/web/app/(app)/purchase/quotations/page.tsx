import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function QuotationsPage() {
  if (!(await requirePermission('purchase.quotations.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.quotations} />;
}
