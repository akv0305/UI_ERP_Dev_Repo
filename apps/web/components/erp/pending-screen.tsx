import type { Permission } from '@/config/navigation';
import { terminology } from '@/config/terminology';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { EmptyState } from './empty-state';
import { NotAuthorised } from './not-authorised';
import { PageHeader } from './page-header';

export interface PendingScreenProps {
  title: string;
  permission?: Permission;
}

export function PendingScreen({ title, permission }: PendingScreenProps) {
  if (permission !== undefined && !getCurrentPermissions().includes(permission)) {
    return <NotAuthorised />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState title={terminology.messages.screenPendingSpecification} />
    </div>
  );
}
