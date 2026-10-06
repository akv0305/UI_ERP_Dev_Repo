import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function ApprovalMatrixPage() {
  return (
    <PendingScreen
      title={terminology.nav.approvalMatrix}
      permission="administration.approvalMatrix.view"
    />
  );
}
