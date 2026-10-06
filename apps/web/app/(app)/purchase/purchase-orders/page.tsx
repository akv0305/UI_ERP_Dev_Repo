import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function PurchaseOrdersPage() {
  if (!requirePermission('purchase.purchaseOrders.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.purchaseOrders} />;
}
