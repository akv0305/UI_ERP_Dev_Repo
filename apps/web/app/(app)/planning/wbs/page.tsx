import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function WbsPage() {
  return <PendingScreen title={terminology.nav.wbs} permission="planning.wbs.view" />;
}
