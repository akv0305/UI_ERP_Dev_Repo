import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function SitesAndStoresPage() {
  if (!requirePermission('masters.sitesAndStores.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.sitesAndStores} />;
}
