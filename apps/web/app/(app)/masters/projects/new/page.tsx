import { CompanyListQuery, PagedCompaniesResponse, StateListResponse } from '@uie/contracts';
import { EmptyState, ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { buildQueryString } from '@/lib/list-params';
import { ProjectForm } from '../project-form';

const COMPANY_OPTIONS_LIMIT = 100;

export default async function NewProjectPage() {
  if (!(await requirePermission('masters.projects.manage'))) {
    return <NotAuthorised />;
  }

  // Companies need masters.companies.view; a manager of projects without it cannot pick one.
  const [companies, states] = await Promise.all([
    apiGet(
      `/api/companies?${buildQueryString({ ...CompanyListQuery.parse({}), pageSize: COMPANY_OPTIONS_LIMIT, isActive: 'true' })}`,
      PagedCompaniesResponse,
    ),
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
          label: `${company.code} ${company.legalName}`,
        }))}
      />
    </div>
  );
}
