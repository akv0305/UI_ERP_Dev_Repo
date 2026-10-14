import { ITEM_STATUSES, type ItemStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';

const STATUS_KEYS: Record<ItemStatus, StatusKey> = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pendingApproval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export function ItemStatusChip({ status }: { status: ItemStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const ITEM_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: terminology.filters.all },
  ...ITEM_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
