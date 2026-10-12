import {
  AuditEventListQuery,
  PagedAuditEventsResponse,
  PagedUsersResponse,
  UserListQuery,
} from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { AuditLogClient, type ActorOption } from './audit-log-client';

type SearchParams = Record<string, string | string[] | undefined>;

const ACTOR_OPTIONS_LIMIT = 100;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Users for the "User" filter; omitted when the viewer may not list users. */
async function loadActorOptions(canListUsers: boolean): Promise<ActorOption[]> {
  if (!canListUsers) {
    return [];
  }

  const query = UserListQuery.parse({ pageSize: ACTOR_OPTIONS_LIMIT });
  const result = await apiGet(
    `/api/users?pageSize=${query.pageSize}&sortBy=displayName`,
    PagedUsersResponse,
  );

  return result.kind === 'ok'
    ? result.data.items.map((user) => ({ id: user.id, label: user.displayName }))
    : [];
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('administration.auditLog.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const parsed = AuditEventListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    entityType: firstValue(raw.entityType) || undefined,
    entityId: firstValue(raw.entityId) || undefined,
    actorUserId: firstValue(raw.actorUserId) || undefined,
    fromDate: firstValue(raw.fromDate) || undefined,
    toDate: firstValue(raw.toDate) || undefined,
  });
  const query = parsed.success ? parsed.data : AuditEventListQuery.parse({});

  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  for (const key of ['entityType', 'entityId', 'actorUserId', 'fromDate', 'toDate'] as const) {
    const value = query[key];

    if (value !== undefined) {
      params.set(key, value);
    }
  }

  const [result, actors] = await Promise.all([
    apiGet(`/api/audit-events?${params.toString()}`, PagedAuditEventsResponse),
    loadActorOptions(permissions.includes('administration.users.view')),
  ]);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.auditLog.loadError} />;
  }

  return <AuditLogClient data={result.data} query={query} actors={actors} />;
}
