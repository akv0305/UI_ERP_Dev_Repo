import { CompanyDetailResponse, ProjectResponse, StateListResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/format';
import { stateLabel } from '@/lib/state-options';
import { ActiveStatus } from '../../_components/active-status';
import { ProjectForm } from '../project-form';
import { ProjectStatusAction } from './project-status-action';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.projects.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const canManage = permissions.includes('masters.projects.manage');
  const result = await apiGet(`/api/projects/${encodeURIComponent(id)}`, ProjectResponse);

  if (result.kind === 'notFound') {
    return <ErrorState description={terminology.projects.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.projects.loadError} />;
  }

  const project = result.data;
  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${project.id}`}>
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
            value: <ActiveStatus isActive={project.isActive} />,
          },
          { label: terminology.masters.infoCreated, value: formatDateTime(project.createdAt) },
          { label: terminology.masters.infoUpdated, value: formatDateTime(project.updatedAt) },
        ]}
      />
    </section>
  );

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={project.name} subtitle={project.code} actions={history} />
        {audit}
        <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
          <KeyValueGrid
            items={[
              { label: terminology.projects.fieldCode, value: project.code },
              { label: terminology.projects.fieldName, value: project.name },
              {
                label: terminology.projects.fieldCompany,
                value: `${project.company.code} ${project.company.legalName}`,
              },
              {
                label: terminology.projects.fieldState,
                value:
                  project.state === null ? terminology.labels.notSet : stateLabel(project.state),
              },
              {
                label: terminology.projects.fieldBilling,
                value: project.billingGstRegistration?.gstin ?? terminology.labels.notSet,
              },
            ]}
          />
        </section>
      </div>
    );
  }

  // The company is fixed, so its active registrations are the only billing choices.
  const [states, company] = await Promise.all([
    apiGet('/api/states', StateListResponse),
    permissions.includes('masters.companies.view')
      ? apiGet(`/api/companies/${project.company.id}`, CompanyDetailResponse)
      : Promise.resolve(null),
  ]);

  if (states.kind !== 'ok') {
    return <ErrorState description={terminology.projects.optionsUnavailable} />;
  }

  if (company !== null && company.kind !== 'ok') {
    return <ErrorState description={terminology.projects.registrationsUnavailable} />;
  }

  const billingOptions =
    company === null || company.kind !== 'ok'
      ? []
      : company.data.gstRegistrations
          .filter((registration) => registration.isActive)
          .map((registration) => ({ value: registration.id, label: registration.gstin }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.projects.editProject}
        subtitle={`${project.code} ${project.name}`}
        actions={
          <>
            {history}
            <ProjectStatusAction project={project} />
          </>
        }
      />
      {audit}
      <ProjectForm
        project={project}
        states={states.data.items}
        companyOptions={[
          {
            value: project.company.id,
            label: `${project.company.code} ${project.company.legalName}`,
          },
        ]}
        billingOptions={billingOptions}
      />
    </div>
  );
}
