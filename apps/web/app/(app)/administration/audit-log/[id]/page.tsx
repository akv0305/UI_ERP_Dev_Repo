import { AuditEventDetail } from '@uie/contracts';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { entityTypeLabel } from '@/lib/audit-labels';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';
import { AuditDiffTable } from './audit-diff-table';

export default async function AuditEventPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('administration.auditLog.view'))) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/audit-events/${encodeURIComponent(id)}`, AuditEventDetail);

  if (result.kind === 'notFound') {
    return <ErrorState description={terminology.auditLog.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={terminology.auditLog.loadError} />;
  }

  const event = result.data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.auditLog.detailTitle}
        subtitle={event.entityLabel}
        actions={
          <Button asChild variant="outline">
            <Link href="/administration/audit-log">{terminology.actions.back}</Link>
          </Button>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
        <KeyValueGrid
          items={[
            { label: terminology.auditLog.fieldWhen, value: formatDateTime(event.occurredAt) },
            {
              label: terminology.auditLog.fieldUser,
              value: event.actor?.displayName ?? terminology.auditLog.system,
            },
            {
              label: terminology.auditLog.fieldAction,
              value: terminology.auditLog.actions[event.action],
            },
            {
              label: terminology.auditLog.fieldEntityType,
              value: entityTypeLabel(event.entityType),
            },
            { label: terminology.auditLog.fieldEntity, value: event.entityLabel },
            {
              label: terminology.auditLog.fieldRequestId,
              value: event.requestId ?? terminology.auditLog.emptyValue,
            },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {terminology.auditLog.sectionChanges}
        </h2>
        <AuditDiffTable before={event.before} after={event.after} />
      </section>
    </div>
  );
}
