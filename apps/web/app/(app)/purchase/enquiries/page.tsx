import { EnquiryListQuery, PagedEnquiriesResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { EnquiriesListClient } from './enquiries-list-client';

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.enquiries.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = EnquiryListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    status: firstValue(raw.status) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : EnquiryListQuery.parse({});
  const result = await apiGet(`/api/enquiries?${buildQueryString(query)}`, PagedEnquiriesResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.enquiries.loadError} />;
  }

  return (
    <EnquiriesListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('purchase.enquiries.manage')}
    />
  );
}
