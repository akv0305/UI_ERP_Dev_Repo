import { ItemCategoryListQuery, PagedItemCategoriesResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { CategoriesListClient } from './categories-list-client';

export default async function ItemCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.items.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = ItemCategoryListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : ItemCategoryListQuery.parse({});
  const result = await apiGet(
    `/api/item-categories?${buildQueryString(query)}`,
    PagedItemCategoriesResponse,
  );

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.itemCategories.loadError} />;
  }

  return (
    <CategoriesListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.items.manage')}
    />
  );
}
