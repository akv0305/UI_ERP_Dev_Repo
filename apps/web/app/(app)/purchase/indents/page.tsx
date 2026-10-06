import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function IndentsPage() {
  return <PendingScreen title={terminology.nav.indents} permission="purchase.indents.view" />;
}
