import { EmptyState, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={terminology.nav.home} />
      <EmptyState title={terminology.messages.screenPendingSpecification} />
    </div>
  );
}
