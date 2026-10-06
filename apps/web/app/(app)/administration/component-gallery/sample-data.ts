import type { StatusKey } from '@/components/erp';

export interface SampleRow {
  code: string;
  name: string;
  status: StatusKey;
  quantity: string;
  amount: string;
  date: string;
}

const statuses: StatusKey[] = [
  'draft',
  'submitted',
  'pendingApproval',
  'approved',
  'rejected',
  'returned',
  'revised',
  'cancelled',
  'closed',
];

export const sampleRows: SampleRow[] = Array.from({ length: 12 }, (_, index) => {
  const sequence = String(index + 1).padStart(3, '0');

  return {
    code: `Sample ${sequence}`,
    name: `Sample item ${sequence}`,
    status: statuses[index % statuses.length] ?? 'draft',
    quantity: `${(index + 1) * 5}.500`,
    amount: `${(index + 1) * 1250}.00`,
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
  };
});

export const sampleOptions = [
  { value: 'sample-001', label: 'Sample 001' },
  { value: 'sample-002', label: 'Sample 002' },
  { value: 'sample-003', label: 'Sample 003' },
];

export const sampleLabels = {
  code: 'Sample code',
  name: 'Sample name',
  status: 'Sample status',
  quantity: 'Sample quantity',
  amount: 'Sample amount',
  date: 'Sample date',
  formName: 'Sample name',
  formQuantity: 'Sample quantity',
  formStatus: 'Sample status',
  formDate: 'Sample date',
  formActive: 'Sample active',
  formNotes: 'Sample notes',
  formVendor: 'Sample vendor',
  sectionTitle: 'Sample section',
  sectionDescription: 'Sample section description',
  dialogTitle: 'Sample confirmation',
  dialogDescription: 'Sample confirmation description.',
  dialogConfirm: 'Confirm sample',
  errorTitle: 'Sample error',
  errorDescription: 'Sample error description.',
  detailTitle: 'Sample 001',
  detailOverviewTab: 'Sample overview',
  detailLinesTab: 'Sample lines',
  detailSideTitle: 'Sample side panel',
  filterName: 'Sample name',
  filterStatus: 'Sample status',
  filterDate: 'Sample date range',
  gridReference: 'Sample reference',
  gridOwner: 'Sample owner',
  gridValue: 'Sample value',
  gridStatus: 'Sample status',
  emptyTitle: 'Sample empty state',
  emptyDescription: 'Sample empty description.',
};
