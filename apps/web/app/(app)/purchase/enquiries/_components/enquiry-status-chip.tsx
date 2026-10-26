import { ENQUIRY_STATUSES, type EnquiryStatus } from '@uie/contracts';
import { StatusChip, type StatusKey } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

const STATUS_KEYS: Record<EnquiryStatus, StatusKey> = {
  DRAFT: 'draft',
  SENT: 'sent',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
};

export function EnquiryStatusChip({ status }: { status: EnquiryStatus }) {
  return <StatusChip status={STATUS_KEYS[status]} />;
}

export const ENQUIRY_STATUS_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...ENQUIRY_STATUSES.map((status) => ({
    value: status,
    label: terminology.statuses[STATUS_KEYS[status]],
  })),
];
