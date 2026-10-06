import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function VendorsPage() {
  return <PendingScreen title={terminology.nav.vendors} permission="masters.vendors.view" />;
}
