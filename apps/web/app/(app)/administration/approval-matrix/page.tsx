import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function ApprovalMatrixPage() {
  if (!(await requirePermission('administration.approvalMatrix.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.approvalMatrix} />;
}
