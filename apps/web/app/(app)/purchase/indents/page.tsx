import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function IndentsPage() {
  if (!requirePermission('purchase.indents.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.indents} />;
}
