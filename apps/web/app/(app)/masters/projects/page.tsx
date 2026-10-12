import {
  CompanyListQuery,
  PagedCompaniesResponse,
  PagedProjectsResponse,
  ProjectListQuery,
} from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import {
  buildQueryString,
  filterFromContext,
  firstValue,
  withSelectedOption,
  type SearchParams,
} from '@/lib/list-params';
import { ProjectsListClient } from './projects-list-client';

const COMPANY_FILTER_LIMIT = 100;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.projects.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const user = await getCurrentUser();
  const context = user?.context;
  const parsed = ProjectListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    companyId: filterFromContext(raw, 'companyId', context?.companyId ?? null),
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : ProjectListQuery.parse({});
  const result = await apiGet(`/api/projects?${buildQueryString(query)}`, PagedProjectsResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.projects.loadError} />;
  }

  // The company filter needs the companies list; without view access to companies it is left out.
  const companies = permissions.includes('masters.companies.view')
    ? await apiGet(
        `/api/companies?${buildQueryString({ ...CompanyListQuery.parse({}), pageSize: COMPANY_FILTER_LIMIT })}`,
        PagedCompaniesResponse,
      )
    : null;

  const companyOptions = withSelectedOption(
    companies?.kind === 'ok'
      ? companies.data.items.map((company) => ({
          value: company.id,
          label: `${company.code} ${company.legalName}`,
        }))
      : [],
    query.companyId,
    context?.companyId === query.companyId ? (context?.companyLabel ?? null) : null,
  );

  return (
    <ProjectsListClient
      key={query.companyId ?? 'all'}
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.projects.manage')}
      companyOptions={companyOptions}
    />
  );
}
