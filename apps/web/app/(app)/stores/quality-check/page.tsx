import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function QualityCheckPage() {
  if (!(await requirePermission('stores.qualityCheck.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.qualityCheck} />;
}
