import { PagedUsersResponse, UserListQuery } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { UsersListClient } from './users-list-client';

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('administration.users.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = UserListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    active: firstValue(raw.active) || undefined,
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : UserListQuery.parse({});

  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  });

  if (query.search !== undefined && query.search.length > 0) {
    params.set('search', query.search);
  }

  if (query.active !== undefined) {
    params.set('active', query.active);
  }

  const result = await apiGet(`/api/users?${params.toString()}`, PagedUsersResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.users.loadError} />;
  }

  return (
    <UsersListClient
      data={result.data}
      query={query}
      canManage={permissions.includes('administration.users.manage')}
    />
  );
}
