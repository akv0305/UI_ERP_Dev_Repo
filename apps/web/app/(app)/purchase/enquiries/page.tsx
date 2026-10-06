import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function EnquiriesPage() {
  return <PendingScreen title={terminology.nav.enquiries} permission="purchase.enquiries.view" />;
}
