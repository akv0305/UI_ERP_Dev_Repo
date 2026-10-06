import { terminology } from '@/config/terminology';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

export interface PendingScreenProps {
  title: string;
}

export function PendingScreen({ title }: PendingScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState title={terminology.messages.screenPendingSpecification} />
    </div>
  );
}
