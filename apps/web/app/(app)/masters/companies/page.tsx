import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default async function CompaniesPage() {
  if (!(await requirePermission('masters.companies.view'))) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.companies} />;
}
