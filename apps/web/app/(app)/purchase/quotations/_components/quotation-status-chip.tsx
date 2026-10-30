import { QUOTATION_STATUSES, type QuotationStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

/** SUPERSEDED uses the existing "revised" colour and label. */
const STATUS_KEYS: Record<QuotationStatus, StatusKey> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  SUPERSEDED: 'revised',
  CANCELLED: 'cancelled',
};

export function QuotationStatusChip({ status }: { status: QuotationStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const QUOTATION_STATUS_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...QUOTATION_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
