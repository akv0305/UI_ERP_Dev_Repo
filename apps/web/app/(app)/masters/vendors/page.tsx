import { PagedVendorsResponse, VendorListQuery } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { VendorsListClient } from './vendors-list-client';

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.vendors.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = VendorListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    vendorType: firstValue(raw.vendorType) || undefined,
    status: firstValue(raw.status) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : VendorListQuery.parse({});
  const result = await apiGet(`/api/vendors?${buildQueryString(query)}`, PagedVendorsResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.vendors.loadError} />;
  }

  return (
    <VendorsListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.vendors.manage')}
    />
  );
}
