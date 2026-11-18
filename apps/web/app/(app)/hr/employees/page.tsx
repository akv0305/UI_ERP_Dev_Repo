import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function EmployeesPage() {
  if (!(await requirePermission('hr.employees.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.employees} />;
}
