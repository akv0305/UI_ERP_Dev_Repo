import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function AuditLogPage() {
  if (!requirePermission('administration.auditLog.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.auditLog} />;
}
