import { EmployeeFormOptionsResponse } from '@uie/contracts';
import { EmptyState, ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { EmployeeForm } from '../employee-form';

const t = terminology.employees;

export default async function NewEmployeePage() {
  if (!(await requirePermission('hr.employees.manage'))) {
    return <NotAuthorised />;
  }

  // Companies where the user holds hr.employees.manage, sorted by code (OQ-140, OQ-142).
  const options = await apiGet('/api/employees/form-options', EmployeeFormOptionsResponse);

  if (options.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  if (options.data.companies.length === 0) {
    return <EmptyState title={t.noCompanies} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.newTitle} />
      <EmployeeForm options={options.data} />
    </div>
  );
}
