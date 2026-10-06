import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function ProjectsPage() {
  return <PendingScreen title={terminology.nav.projects} permission="masters.projects.view" />;
}
