import {
  PagedProjectsResponse,
  PagedSitesResponse,
  ProjectListQuery,
  SiteListQuery,
} from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import {
  buildQueryString,
  filterFromContext,
  firstValue,
  withSelectedOption,
  type SearchParams,
} from '@/lib/list-params';
import { SitesListClient } from './sites-list-client';

const PROJECT_FILTER_LIMIT = 100;

export default async function SitesAndStoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.sitesAndStores.view')) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const user = await getCurrentUser();
  const context = user?.context;
  const parsed = SiteListQuery.safeParse({
    page: firstValue(raw.page),
    pageSize: firstValue(raw.pageSize),
    search: firstValue(raw.search) || undefined,
    isActive: firstValue(raw.isActive) || undefined,
    projectId: filterFromContext(raw, 'projectId', context?.projectId ?? null),
    sortBy: firstValue(raw.sortBy),
    sortDir: firstValue(raw.sortDir),
  });
  const query = parsed.success ? parsed.data : SiteListQuery.parse({});
  const result = await apiGet(`/api/sites?${buildQueryString(query)}`, PagedSitesResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.sites.loadError} />;
  }

  // The project filter needs the projects list; without view access to projects it is left out.
  const projects = permissions.includes('masters.projects.view')
    ? await apiGet(
        `/api/projects?${buildQueryString({ ...ProjectListQuery.parse({}), pageSize: PROJECT_FILTER_LIMIT })}`,
        PagedProjectsResponse,
      )
    : null;

  const projectOptions = withSelectedOption(
    projects?.kind === 'ok'
      ? projects.data.items.map((project) => ({
          value: project.id,
          label: `${project.code} ${project.name}`,
        }))
      : [],
    query.projectId,
    context?.projectId === query.projectId ? (context?.projectLabel ?? null) : null,
  );

  return (
    <SitesListClient
      key={query.projectId ?? 'all'}
      data={result.data}
      query={query}
      canManage={permissions.includes('masters.sitesAndStores.manage')}
      projectOptions={projectOptions}
    />
  );
}
