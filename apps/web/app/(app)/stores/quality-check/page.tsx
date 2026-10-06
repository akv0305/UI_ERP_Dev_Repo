import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function QualityCheckPage() {
  return (
    <PendingScreen title={terminology.nav.qualityCheck} permission="stores.qualityCheck.view" />
  );
}
