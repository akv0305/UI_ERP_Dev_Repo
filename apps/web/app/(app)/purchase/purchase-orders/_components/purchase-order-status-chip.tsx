import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

const STATUS_KEYS: Record<PurchaseOrderStatus, StatusKey> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  CANCELLED: 'cancelled',
};

export function PurchaseOrderStatusChip({ status }: { status: PurchaseOrderStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const PURCHASE_ORDER_STATUS_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...PURCHASE_ORDER_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
