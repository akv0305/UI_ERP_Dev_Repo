import { INDENT_STATUSES, type IndentStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

const STATUS_KEYS: Record<IndentStatus, StatusKey> = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pendingApproval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export function IndentStatusChip({ status }: { status: IndentStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const INDENT_STATUS_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...INDENT_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
