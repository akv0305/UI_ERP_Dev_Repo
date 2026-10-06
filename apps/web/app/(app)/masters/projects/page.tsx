import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function ProjectsPage() {
  if (!requirePermission('masters.projects.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.projects} />;
}
