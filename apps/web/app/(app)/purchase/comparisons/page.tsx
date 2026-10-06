import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function ComparisonsPage() {
  if (!(await requirePermission('purchase.comparisons.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.comparisons} />;
}
