import { PagedProjectsResponse, ProjectListQuery, StateListResponse } from '@uie/contracts';
import { EmptyState, ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { buildQueryString } from '@/lib/list-params';
import { SiteForm } from '../site-form';

const PROJECT_OPTIONS_LIMIT = 100;

export default async function NewSitePage() {
  if (!(await requirePermission('masters.sitesAndStores.manage'))) {
    return <NotAuthorised />;
  }

  // Projects need masters.projects.view; a manager of sites without it cannot pick one.
  const [projects, states] = await Promise.all([
    apiGet(
      `/api/projects?${buildQueryString({ ...ProjectListQuery.parse({}), pageSize: PROJECT_OPTIONS_LIMIT, isActive: 'true' })}`,
      PagedProjectsResponse,
    ),
    apiGet('/api/states', StateListResponse),
  ]);

  if (projects.kind !== 'ok' || states.kind !== 'ok') {
    return <ErrorState description={terminology.sites.optionsUnavailable} />;
  }

  if (projects.data.items.length === 0) {
    return <EmptyState title={terminology.sites.noProjects} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.sites.newSite} />
      <SiteForm
        states={states.data.items}
        projectOptions={projects.data.items.map((project) => ({
          value: project.id,
          label: `${project.code} ${project.name}`,
        }))}
      />
    </div>
  );
}
