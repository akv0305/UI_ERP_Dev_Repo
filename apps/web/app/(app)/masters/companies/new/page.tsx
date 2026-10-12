import { StateListResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { CompanyForm } from '../company-form';

export default async function NewCompanyPage() {
  if (!(await requirePermission('masters.companies.manage'))) {
    return <NotAuthorised />;
  }

  const states = await apiGet('/api/states', StateListResponse);

  if (states.kind !== 'ok') {
    return <ErrorState description={terminology.companies.statesUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.companies.newCompany} />
      <CompanyForm states={states.data.items} />
    </div>
  );
}
