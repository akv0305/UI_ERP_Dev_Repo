import { IndentDetailResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { IndentStatusChip } from '../_components/indent-status-chip';
import { IndentActions } from './indent-actions';

const t = terminology.indents;
const notSet = terminology.labels.notSet;

function actorLine(actor: { displayName: string } | null, at: string | null): string {
  if (at === null) {
    return notSet;
  }

  return actor === null ? formatDateTime(at) : `${actor.displayName}, ${formatDateTime(at)}`;
}

function scopeLabel(scope: { code: string; name: string } | null): string {
  return scope === null ? notSet : `${scope.code}  ${scope.name}`;
}

function itemText(item: IndentDetailResponse['lines'][number]['item']): string {
  return item.size === null
    ? `${item.code}  ${item.description}`
    : `${item.code}  ${item.description}, ${item.size}`;
}

export default async function IndentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.indents.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/indents/${encodeURIComponent(id)}`, IndentDetailResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const indent = result.data;

  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${indent.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const edit = indent.canEdit ? (
    <Button asChild variant="outline">
      <Link href={`/purchase/indents/${indent.id}/edit`}>{t.edit}</Link>
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={indent.number ?? t.unnumbered}
        subtitle={scopeLabel(indent.project)}
        actions={
          <>
            {history}
            {edit}
            <IndentActions indent={indent} />
          </>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionStatus}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.infoStatus, value: <IndentStatusChip status={indent.status} /> },
            { label: t.infoPostedBy, value: actorLine(indent.createdBy, indent.createdAt) },
            { label: t.infoSubmitted, value: actorLine(indent.submittedBy, indent.submittedAt) },
            { label: t.infoDecided, value: actorLine(indent.decidedBy, indent.decidedAt) },
            { label: t.infoDecisionRemarks, value: indent.decisionRemarks ?? notSet },
            { label: t.infoCancelled, value: actorLine(indent.cancelledBy, indent.cancelledAt) },
            { label: t.infoCancelRemarks, value: indent.cancelRemarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionHeader}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.fieldCompany, value: scopeLabel(indent.company) },
            { label: t.fieldProject, value: scopeLabel(indent.project) },
            { label: t.fieldSite, value: scopeLabel(indent.site) },
            {
              label: t.fieldStore,
              value: indent.store === null ? t.noStore : scopeLabel(indent.store),
            },
            { label: t.fieldIndentDate, value: formatDate(indent.indentDate) },
            {
              label: t.fieldRequiredByDate,
              value: indent.requiredByDate === null ? notSet : formatDate(indent.requiredByDate),
            },
            { label: t.fieldRequestedBy, value: indent.requestedBy },
            { label: t.fieldRemarks, value: indent.remarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionLines}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
                <th className="px-2 py-2 font-medium">{t.columnItem}</th>
                <th className="w-20 px-2 py-2 font-medium">{t.columnUnit}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnRequiredQty}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnApprovedQty}</th>
                <th className="px-2 py-2 font-medium">{t.columnPurpose}</th>
                <th className="px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              </tr>
            </thead>
            <tbody>
              {indent.lines.map((line) => (
                <tr key={line.id} className="border-b border-border align-top">
                  <td className="px-2 py-2">{line.lineNo}</td>
                  <td className="px-2 py-2">{itemText(line.item)}</td>
                  <td className="px-2 py-2">{line.item.unitCode}</td>
                  <td className="px-2 py-2 text-right">
                    {formatQty(line.requiredQty, line.item.decimalPlaces)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {line.approvedQty === null
                      ? notSet
                      : formatQty(line.approvedQty, line.item.decimalPlaces)}
                  </td>
                  <td className="px-2 py-2">{line.purpose ?? notSet}</td>
                  <td className="px-2 py-2">{line.remarks ?? notSet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
