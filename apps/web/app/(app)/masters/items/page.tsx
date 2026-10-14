import {
  ItemCategoryListQuery,
  ItemListQuery,
  PagedItemCategoriesResponse,
  PagedItemsResponse,
  PagedUnitsResponse,
  UnitListQuery,
} from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { ItemsListClient } from './items-list-client';

const FILTER_OPTION_LIMIT = 100;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.items.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = ItemListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    categoryId: firstValue(raw.categoryId) || undefined,
    unitId: firstValue(raw.unitId) || undefined,
    status: firstValue(raw.status) || undefined,
    itemUse: firstValue(raw.itemUse) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : ItemListQuery.parse({});

  // Filter choices come from the list endpoints (masters.items.view), so viewers get them too.
  const [result, categories, units] = await Promise.all([
    apiGet(`/api/items?${buildQueryString(query)}`, PagedItemsResponse),
    apiGet(
      `/api/item-categories?${buildQueryString({ ...ItemCategoryListQuery.parse({}), pageSize: FILTER_OPTION_LIMIT })}`,
      PagedItemCategoriesResponse,
    ),
    apiGet(
      `/api/units?${buildQueryString({ ...UnitListQuery.parse({}), pageSize: FILTER_OPTION_LIMIT })}`,
      PagedUnitsResponse,
    ),
  ]);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.items.loadError} />;
  }

  return (
    <ItemsListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.items.manage')}
      categoryOptions={
        categories.kind === 'ok'
          ? categories.data.items.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))
          : []
      }
      unitOptions={
        units.kind === 'ok'
          ? units.data.items.map((u) => ({ value: u.id, label: `${u.code} ${u.name}` }))
          : []
      }
    />
  );
}
