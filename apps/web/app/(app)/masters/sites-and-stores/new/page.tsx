import { ProjectOptionsResponse, StateListResponse } from '@uie/contracts';
import { EmptyState, ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { SiteForm } from '../site-form';

export default async function NewSitePage() {
  if (!(await requirePermission('masters.sitesAndStores.manage'))) {
    return <NotAuthorised />;
  }

  // Needs only masters.sitesAndStores.manage: the API lists the projects this user may create under.
  const [projects, states] = await Promise.all([
    apiGet('/api/projects/options', ProjectOptionsResponse),
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
          label: project.label,
        }))}
      />
    </div>
  );
}
