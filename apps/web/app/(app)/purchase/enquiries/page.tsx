import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function EnquiriesPage() {
  if (!(await requirePermission('purchase.enquiries.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.enquiries} />;
}
