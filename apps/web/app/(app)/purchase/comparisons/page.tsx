import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function ComparisonsPage() {
  return (
    <PendingScreen title={terminology.nav.comparisons} permission="purchase.comparisons.view" />
  );
}
