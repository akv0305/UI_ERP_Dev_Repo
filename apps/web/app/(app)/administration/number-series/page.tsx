import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function NumberSeriesPage() {
  return (
    <PendingScreen
      title={terminology.nav.numberSeries}
      permission="administration.numberSeries.view"
    />
  );
}
