import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function MaterialIssuesPage() {
  return (
    <PendingScreen title={terminology.nav.materialIssues} permission="stores.materialIssues.view" />
  );
}
