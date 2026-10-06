import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function MaterialIssuesPage() {
  if (!(await requirePermission('stores.materialIssues.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.materialIssues} />;
}
