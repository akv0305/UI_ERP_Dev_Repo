import { CompanyOptionsResponse, StateListResponse } from '@uie/contracts';
import { EmptyState, ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { ProjectForm } from '../project-form';

export default async function NewProjectPage() {
  if (!(await requirePermission('masters.projects.manage'))) {
    return <NotAuthorised />;
  }

  // Needs only masters.projects.manage: the API lists the companies this user may create under.
  const [companies, states] = await Promise.all([
    apiGet('/api/companies/options', CompanyOptionsResponse),
    apiGet('/api/states', StateListResponse),
  ]);

  if (companies.kind !== 'ok' || states.kind !== 'ok') {
    return <ErrorState description={terminology.projects.optionsUnavailable} />;
  }

  if (companies.data.items.length === 0) {
    return <EmptyState title={terminology.projects.noCompanies} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.projects.newProject} />
      <ProjectForm
        states={states.data.items}
        companyOptions={companies.data.items.map((company) => ({
          value: company.id,
          label: company.label,
        }))}
      />
    </div>
  );
}
