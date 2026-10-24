import { IndentListQuery, PagedIndentsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { IndentsListClient } from './indents-list-client';

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.indents.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = IndentListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    status: firstValue(raw.status) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : IndentListQuery.parse({});
  const result = await apiGet(`/api/indents?${buildQueryString(query)}`, PagedIndentsResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.indents.loadError} />;
  }

  return (
    <IndentsListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('purchase.indents.manage')}
    />
  );
}
