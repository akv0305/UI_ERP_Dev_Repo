import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function CompaniesPage() {
  return <PendingScreen title={terminology.nav.companies} permission="masters.companies.view" />;
}
