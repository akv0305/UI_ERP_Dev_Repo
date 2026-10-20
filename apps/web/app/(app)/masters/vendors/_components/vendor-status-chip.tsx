import { VENDOR_STATUSES, type VendorStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

const STATUS_KEYS: Record<VendorStatus, StatusKey> = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pendingApproval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export function VendorStatusChip({ status }: { status: VendorStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const VENDOR_STATUS_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...VENDOR_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
