import { ComparisonDetailResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDate, formatINR } from '@/lib/format';
import { codeName } from '../../enquiries/_components/enquiry-text';
import { actorLine } from '../../quotations/_components/quotation-text';
import { ComparisonGrid } from '../_components/comparison-grid';
import { ComparisonStatusChip } from '../_components/comparison-status-chip';
import { chosenCount, comparisonTitle } from '../_components/comparison-text';
import { ComparisonActions } from './comparison-actions';

const t = terminology.comparisons;
const notSet = terminology.labels.notSet;

function scopeLabel(scope: { code: string; name: string }): string {
  return codeName(scope.code, scope.name);
}

export default async function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.comparisons.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(
    `/api/comparisons/${encodeURIComponent(id)}`,
    ComparisonDetailResponse,
  );

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const comparison = result.data;

  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${comparison.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const edit = comparison.canEdit ? (
    <Button asChild variant="outline">
      <Link href={`/purchase/comparisons/${comparison.id}/edit`}>{t.edit}</Link>
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={comparisonTitle(comparison)}
        subtitle={scopeLabel(comparison.project)}
        actions={
          <>
            {history}
            {edit}
            <ComparisonActions comparison={comparison} />
          </>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionStatus}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.infoStatus, value: <ComparisonStatusChip status={comparison.status} /> },
            {
              label: t.infoCreatedBy,
              value: actorLine(comparison.createdBy, comparison.createdAt, notSet),
            },
            {
              label: t.infoFinalised,
              value: actorLine(comparison.finalisedBy, comparison.finalisedAt, notSet),
            },
            {
              label: t.infoCancelled,
              value: actorLine(comparison.cancelledBy, comparison.cancelledAt, notSet),
            },
            { label: t.infoCancelRemarks, value: comparison.cancelRemarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionHeader}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.fieldCompany, value: scopeLabel(comparison.company) },
            { label: t.fieldProject, value: scopeLabel(comparison.project) },
            { label: t.fieldSite, value: scopeLabel(comparison.site) },
            {
              label: t.fieldEnquiry,
              value: (
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/purchase/enquiries/${comparison.enquiry.id}`}
                >
                  {comparison.enquiry.number}
                </Link>
              ),
            },
            { label: t.fieldComparisonDate, value: formatDate(comparison.comparisonDate) },
            {
              label: t.fieldChosenLines,
              value: chosenCount(comparison.selectedLineCount, comparison.lineCount),
            },
            { label: t.fieldSelectedValue, value: formatINR(comparison.selectedValue) },
            { label: t.fieldRemarks, value: comparison.remarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionGrid}</h2>
        <ComparisonGrid
          vendors={comparison.vendors}
          lines={comparison.lines}
          choices={comparison.lines.map((line) => ({
            vendorId: line.selectedVendorId,
            reason: line.reason ?? '',
          }))}
        />
      </section>
    </div>
  );
}
