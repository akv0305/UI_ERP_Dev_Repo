import { StateListResponse, VendorDetailResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime, formatINR } from '@/lib/format';
import { stateLabel } from '@/lib/state-options';
import { ActiveStatus } from '../../_components/active-status';
import { VendorStatusChip } from '../_components/vendor-status-chip';
import { VendorForm } from '../vendor-form';
import { VendorActions } from './vendor-actions';

const t = terminology.vendors;
const notSet = terminology.labels.notSet;

function actorLine(actor: { displayName: string } | null, at: string | null): string {
  if (at === null) {
    return notSet;
  }

  return actor === null ? formatDateTime(at) : `${actor.displayName}, ${formatDateTime(at)}`;
}

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.vendors.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/vendors/${encodeURIComponent(id)}`, VendorDetailResponse);

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const vendor = result.data;
  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${vendor.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const actions = (
    <>
      {history}
      <VendorActions vendor={vendor} />
    </>
  );
  const approval = (
    <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionApproval}</h2>
      <KeyValueGrid
        items={[
          { label: t.infoApproval, value: <VendorStatusChip status={vendor.status} /> },
          {
            label: terminology.masters.columnStatus,
            value: <ActiveStatus isActive={vendor.isActive} />,
          },
          { label: t.infoSubmitted, value: actorLine(vendor.submittedBy, vendor.submittedAt) },
          { label: t.infoDecided, value: actorLine(vendor.decidedBy, vendor.decidedAt) },
          { label: t.infoDecisionRemarks, value: vendor.decisionRemarks ?? notSet },
          { label: terminology.masters.infoCreated, value: formatDateTime(vendor.createdAt) },
          { label: terminology.masters.infoUpdated, value: formatDateTime(vendor.updatedAt) },
        ]}
      />
    </section>
  );

  if (!vendor.canEdit) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={vendor.legalName} subtitle={vendor.code} actions={actions} />
        {approval}
        <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
          {vendor.canManage ? (
            <p className="mb-3 text-sm text-muted-foreground">{t.lockedNotice}</p>
          ) : null}
          <KeyValueGrid
            items={[
              { label: t.fieldCode, value: vendor.code },
              { label: t.fieldLegalName, value: vendor.legalName },
              { label: t.fieldTradeName, value: vendor.tradeName ?? notSet },
              { label: t.fieldType, value: t.types[vendor.vendorType] },
              { label: t.fieldPan, value: vendor.pan ?? notSet },
              { label: t.fieldUdyam, value: vendor.udyamNumber ?? notSet },
              {
                label: t.fieldMsme,
                value:
                  vendor.msmeCategory === null ? notSet : t.msmeCategories[vendor.msmeCategory],
              },
              { label: t.fieldAddressLine1, value: vendor.addressLine1 ?? notSet },
              { label: t.fieldAddressLine2, value: vendor.addressLine2 ?? notSet },
              { label: t.fieldCity, value: vendor.city ?? notSet },
              {
                label: t.fieldState,
                value: vendor.state === null ? notSet : stateLabel(vendor.state),
              },
              { label: t.fieldPinCode, value: vendor.pinCode ?? notSet },
              {
                label: t.fieldPaymentTerms,
                value:
                  vendor.paymentTermsDays === null
                    ? notSet
                    : `${vendor.paymentTermsDays} ${t.daysSuffix}`,
              },
              {
                label: t.fieldCreditLimit,
                value: vendor.creditLimit === null ? notSet : formatINR(vendor.creditLimit),
              },
              { label: t.fieldRemarks, value: vendor.remarks ?? notSet },
            ]}
          />
        </section>
      </div>
    );
  }

  // canEdit implies masters.vendors.manage.
  const states = await apiGet('/api/states', StateListResponse);

  if (states.kind !== 'ok') {
    return <ErrorState description={t.statesUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.editTitle}
        subtitle={`${vendor.code} ${vendor.legalName}`}
        actions={actions}
      />
      {approval}
      <VendorForm vendor={vendor} states={states.data.items} />
    </div>
  );
}
