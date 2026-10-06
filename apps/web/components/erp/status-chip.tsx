import { terminology } from '@/config/terminology';
import { theme } from '@/config/theme';
import { cn } from '@/lib/utils';

export type StatusKey = keyof typeof theme.colors.status;

const statusChipClasses: Record<StatusKey, string> = {
  draft: 'border-status-draft/40 bg-status-draft/10 text-status-draft',
  submitted: 'border-status-submitted/40 bg-status-submitted/10 text-status-submitted',
  pendingApproval:
    'border-status-pending-approval/40 bg-status-pending-approval/10 text-status-pending-approval',
  approved: 'border-status-approved/40 bg-status-approved/10 text-status-approved',
  rejected: 'border-status-rejected/40 bg-status-rejected/10 text-status-rejected',
  returned: 'border-status-returned/40 bg-status-returned/10 text-status-returned',
  revised: 'border-status-revised/40 bg-status-revised/10 text-status-revised',
  cancelled: 'border-status-cancelled/40 bg-status-cancelled/10 text-status-cancelled',
  closed: 'border-status-closed/40 bg-status-closed/10 text-status-closed',
};

export interface StatusChipProps {
  status: StatusKey;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        statusChipClasses[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {terminology.statuses[status]}
    </span>
  );
}
