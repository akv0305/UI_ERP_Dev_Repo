import { SiteResponse, StateListResponse, StoreListResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/format';
import { stateLabel } from '@/lib/state-options';
import { ActiveStatus } from '../../_components/active-status';
import { SiteForm } from '../site-form';
import { SiteStatusAction } from './site-status-action';
import { StoresSection } from './stores-section';

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.sitesAndStores.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const canManage = permissions.includes('masters.sitesAndStores.manage');
  const [siteResult, storesResult] = await Promise.all([
    apiGet(`/api/sites/${encodeURIComponent(id)}`, SiteResponse),
    apiGet(`/api/sites/${encodeURIComponent(id)}/stores`, StoreListResponse),
  ]);

  if (siteResult.kind === 'notFound') {
    return <ErrorState description={terminology.sites.notFound} />;
  }

  if (siteResult.kind !== 'ok' || storesResult.kind !== 'ok') {
    return <ErrorState description={terminology.sites.loadError} />;
  }

  const site = siteResult.data;
  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${site.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const audit = (
    <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        {terminology.masters.sectionAudit}
      </h2>
      <KeyValueGrid
        items={[
          {
            label: terminology.masters.columnStatus,
            value: <ActiveStatus isActive={site.isActive} />,
          },
          { label: terminology.masters.infoCreated, value: formatDateTime(site.createdAt) },
          { label: terminology.masters.infoUpdated, value: formatDateTime(site.updatedAt) },
        ]}
      />
    </section>
  );
  const stores = (
    <StoresSection siteId={site.id} stores={storesResult.data.items} canManage={canManage} />
  );

  if (!canManage) {
    const notSet = terminology.labels.notSet;

    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={site.name} subtitle={site.code} actions={history} />
        {audit}
        <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
          <KeyValueGrid
            items={[
              { label: terminology.sites.fieldCode, value: site.code },
              { label: terminology.sites.fieldName, value: site.name },
              {
                label: terminology.sites.fieldProject,
                value: `${site.project.code} ${site.project.name}`,
              },
              { label: terminology.sites.fieldAddressLine1, value: site.addressLine1 ?? notSet },
              { label: terminology.sites.fieldAddressLine2, value: site.addressLine2 ?? notSet },
              { label: terminology.sites.fieldCity, value: site.city ?? notSet },
              {
                label: terminology.sites.fieldState,
                value: site.state === null ? notSet : stateLabel(site.state),
              },
              { label: terminology.sites.fieldPinCode, value: site.pinCode ?? notSet },
              { label: terminology.sites.fieldContactPerson, value: site.contactPerson ?? notSet },
              { label: terminology.sites.fieldContactPhone, value: site.contactPhone ?? notSet },
            ]}
          />
        </section>
        {stores}
      </div>
    );
  }

  const states = await apiGet('/api/states', StateListResponse);

  if (states.kind !== 'ok') {
    return <ErrorState description={terminology.companies.statesUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.sites.editSite}
        subtitle={`${site.code} ${site.name}`}
        actions={
          <>
            {history}
            <SiteStatusAction site={site} />
          </>
        }
      />
      {audit}
      <SiteForm
        site={site}
        states={states.data.items}
        projectOptions={[
          { value: site.project.id, label: `${site.project.code} ${site.project.name}` },
        ]}
      />
      {stores}
    </div>
  );
}
