import { DesignationListQuery, PagedDesignationsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { DesignationsListClient } from './designations-list-client';

export default async function DesignationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('hr.designations.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = DesignationListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : DesignationListQuery.parse({});
  const result = await apiGet(
    `/api/designations?${buildQueryString(query)}`,
    PagedDesignationsResponse,
  );

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.designations.loadError} />;
  }

  return (
    <DesignationsListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('hr.designations.manage')}
    />
  );
}
