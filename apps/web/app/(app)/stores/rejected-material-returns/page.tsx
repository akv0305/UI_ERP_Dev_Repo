import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function RejectedMaterialReturnsPage() {
  if (!requirePermission('stores.rejectedMaterialReturns.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.rejectedMaterialReturns} />;
}
