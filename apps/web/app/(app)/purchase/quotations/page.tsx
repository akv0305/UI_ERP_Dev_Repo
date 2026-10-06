import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function QuotationsPage() {
  return <PendingScreen title={terminology.nav.quotations} permission="purchase.quotations.view" />;
}
