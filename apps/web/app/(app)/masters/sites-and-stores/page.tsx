import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function SitesAndStoresPage() {
  return (
    <PendingScreen
      title={terminology.nav.sitesAndStores}
      permission="masters.sitesAndStores.view"
    />
  );
}
