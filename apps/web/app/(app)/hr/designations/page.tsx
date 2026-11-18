import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function DesignationsPage() {
  if (!(await requirePermission('hr.designations.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.designations} />;
}
