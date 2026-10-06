import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function GoodsReceiptsPage() {
  if (!(await requirePermission('stores.goodsReceipts.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.goodsReceipts} />;
}
