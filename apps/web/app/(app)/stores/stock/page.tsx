import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function StockPage() {
  return <PendingScreen title={terminology.nav.stock} permission="stores.stock.view" />;
}
