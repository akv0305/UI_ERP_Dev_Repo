import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function UsersPage() {
  return <PendingScreen title={terminology.nav.users} permission="administration.users.view" />;
}
