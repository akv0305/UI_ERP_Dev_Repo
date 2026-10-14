import { PagedUnitsResponse, UnitListQuery } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { UnitsListClient } from './units-list-client';

export default async function UnitsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.items.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = UnitListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : UnitListQuery.parse({});
  const result = await apiGet(`/api/units?${buildQueryString(query)}`, PagedUnitsResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.units.loadError} />;
  }

  return (
    <UnitsListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.items.manage')}
    />
  );
}
