import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function ItemsPage() {
  return <PendingScreen title={terminology.nav.items} permission="masters.items.view" />;
}
