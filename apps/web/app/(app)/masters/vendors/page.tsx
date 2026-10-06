import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function VendorsPage() {
  if (!(await requirePermission('masters.vendors.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.vendors} />;
}
