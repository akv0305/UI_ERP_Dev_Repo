import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function QualityCheckPage() {
  if (!requirePermission('stores.qualityCheck.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.qualityCheck} />;
}
