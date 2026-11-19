import { EmployeeListQuery, PagedEmployeesResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { EmployeesListClient } from './employees-list-client';

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('hr.employees.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = EmployeeListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    status: firstValue(raw.status) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : EmployeeListQuery.parse({});
  const result = await apiGet(`/api/employees?${buildQueryString(query)}`, PagedEmployeesResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.employees.loadError} />;
  }

  // Project/site-only holders get an empty list from the API (OQ-145 a).
  return (
    <EmployeesListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('hr.employees.manage')}
    />
  );
}
