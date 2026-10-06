import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function AuditLogPage() {
  return (
    <PendingScreen title={terminology.nav.auditLog} permission="administration.auditLog.view" />
  );
}
