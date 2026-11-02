import { PagedPurchaseOrdersResponse, PurchaseOrderListQuery } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { PurchaseOrdersListClient } from './purchase-orders-list-client';

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.purchaseOrders.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = PurchaseOrderListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    status: firstValue(raw.status) || undefined,
    source: firstValue(raw.source) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : PurchaseOrderListQuery.parse({});
  const result = await apiGet(
    `/api/purchase-orders?${buildQueryString(query)}`,
    PagedPurchaseOrdersResponse,
  );

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.purchaseOrders.loadError} />;
  }

  return <PurchaseOrdersListClient data={result.data} query={query} />;
}
