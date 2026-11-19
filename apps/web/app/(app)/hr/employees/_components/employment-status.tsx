import { EMPLOYEE_STATUSES, type EmployeeStatus } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { ALL_VALUE } from '@/lib/list-params';

/** Active / Left, worked out by the API from the date of leaving (OQ-134, OQ-141). */
export function EmploymentStatus({ status }: { status: EmployeeStatus }) {
  return (
    <span className={status === 'ACTIVE' ? 'text-success' : 'text-muted-foreground'}>
      {terminology.employees.statuses[status]}
    </span>
  );
}

export const EMPLOYMENT_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: terminology.filters.all },
  ...EMPLOYEE_STATUSES.map((status) => ({
    value: status,
    label: terminology.employees.statuses[status],
  })),
];
