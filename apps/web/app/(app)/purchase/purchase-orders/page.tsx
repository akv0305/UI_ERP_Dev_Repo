import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function PurchaseOrdersPage() {
  return (
    <PendingScreen
      title={terminology.nav.purchaseOrders}
      permission="purchase.purchaseOrders.view"
    />
  );
}
