import { CompanyListQuery, PagedCompaniesResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { CompaniesListClient } from './companies-list-client';

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.companies.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = CompanyListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    entityType: firstValue(raw.entityType) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : CompanyListQuery.parse({});
  const result = await apiGet(`/api/companies?${buildQueryString(query)}`, PagedCompaniesResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.companies.loadError} />;
  }

  return (
    <CompaniesListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.companies.manage')}
    />
  );
}
