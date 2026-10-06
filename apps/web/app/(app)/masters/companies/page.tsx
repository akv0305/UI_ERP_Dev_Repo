import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function CompaniesPage() {
  if (!requirePermission('masters.companies.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.companies} />;
}
