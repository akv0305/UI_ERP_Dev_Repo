import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function NumberSeriesPage() {
  if (!requirePermission('administration.numberSeries.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.numberSeries} />;
}
