import { COMPARISON_STATUSES, type ComparisonStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

const STATUS_KEYS: Record<ComparisonStatus, StatusKey> = {
  DRAFT: 'draft',
  FINALISED: 'finalised',
  CANCELLED: 'cancelled',
};

export function ComparisonStatusChip({ status }: { status: ComparisonStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const COMPARISON_STATUS_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...COMPARISON_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
