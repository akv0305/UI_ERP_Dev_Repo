import { ComparisonListQuery, PagedComparisonsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { ComparisonsListClient } from './comparisons-list-client';

export default async function ComparisonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.comparisons.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = ComparisonListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    status: firstValue(raw.status) || undefined,
    enquiryId: firstValue(raw.enquiryId) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : ComparisonListQuery.parse({});
  const result = await apiGet(
    `/api/comparisons?${buildQueryString(query)}`,
    PagedComparisonsResponse,
  );

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.comparisons.loadError} />;
  }

  return (
    <ComparisonsListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('purchase.comparisons.manage')}
    />
  );
}
