import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function RejectedMaterialReturnsPage() {
  return (
    <PendingScreen
      title={terminology.nav.rejectedMaterialReturns}
      permission="stores.rejectedMaterialReturns.view"
    />
  );
}
