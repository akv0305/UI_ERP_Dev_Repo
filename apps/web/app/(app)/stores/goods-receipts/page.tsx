import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function GoodsReceiptsPage() {
  return (
    <PendingScreen title={terminology.nav.goodsReceipts} permission="stores.goodsReceipts.view" />
  );
}
