import { CompanyDetailResponse, StateListResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/format';
import { stateLabel } from '@/lib/state-options';
import { ActiveStatus } from '../../_components/active-status';
import { CompanyForm } from '../company-form';
import { CompanyStatusAction } from './company-status-action';
import { GstRegistrationsSection } from './gst-registrations-section';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.companies.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const canManage = permissions.includes('masters.companies.manage');
  const result = await apiGet(`/api/companies/${encodeURIComponent(id)}`, CompanyDetailResponse);

  if (result.kind === 'notFound') {
    return <ErrorState description={terminology.companies.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.companies.loadError} />;
  }

  const company = result.data;
  const states = await apiGet('/api/states', StateListResponse);

  if (states.kind !== 'ok') {
    return <ErrorState description={terminology.companies.statesUnavailable} />;
  }

  const audit = (
    <KeyValueGrid
      items={[
        {
          label: terminology.masters.columnStatus,
          value: <ActiveStatus isActive={company.isActive} />,
        },
        { label: terminology.masters.infoCreated, value: formatDateTime(company.createdAt) },
        { label: terminology.masters.infoUpdated, value: formatDateTime(company.updatedAt) },
      ]}
    />
  );
  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${company.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={company.legalName}
        subtitle={company.code}
        actions={
          <>
            {history}
            {canManage ? <CompanyStatusAction company={company} /> : null}
          </>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {terminology.masters.sectionAudit}
        </h2>
        {audit}
      </section>
      {canManage ? (
        <CompanyForm company={company} states={states.data.items} />
      ) : (
        <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
          <KeyValueGrid
            items={[
              { label: terminology.companies.fieldCode, value: company.code },
              { label: terminology.companies.fieldLegalName, value: company.legalName },
              {
                label: terminology.companies.fieldEntityType,
                value: terminology.companies.entityTypes[company.entityType],
              },
              {
                label: terminology.companies.fieldPan,
                value: company.pan ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldTan,
                value: company.tan ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldCin,
                value: company.cin ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldLlpin,
                value: company.llpin ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldAddressLine1,
                value: company.addressLine1 ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldAddressLine2,
                value: company.addressLine2 ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldCity,
                value: company.city ?? terminology.labels.notSet,
              },
              {
                label: terminology.companies.fieldState,
                value:
                  company.state === null ? terminology.labels.notSet : stateLabel(company.state),
              },
              {
                label: terminology.companies.fieldPinCode,
                value: company.pinCode ?? terminology.labels.notSet,
              },
            ]}
          />
        </section>
      )}
      <GstRegistrationsSection
        companyId={company.id}
        registrations={company.gstRegistrations}
        states={states.data.items}
        canManage={canManage}
      />
    </div>
  );
}
