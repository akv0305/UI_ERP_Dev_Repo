import {
  ItemCategoryOptionsResponse,
  ItemResponse,
  ItemUnitOptionsResponse,
  type ItemActorSummary,
} from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/format';
import { withSelectedOption } from '@/lib/list-params';
import { ActiveStatus } from '../../_components/active-status';
import { ItemStatusChip } from '../_components/item-status-chip';
import { ItemForm } from '../item-form';
import { ItemActions } from './item-actions';

const t = terminology.items;
const notSet = terminology.labels.notSet;

function actorLine(actor: ItemActorSummary | null, at: string | null): string {
  if (at === null) {
    return notSet;
  }

  return actor === null ? formatDateTime(at) : `${actor.displayName}, ${formatDateTime(at)}`;
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('masters.items.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/items/${encodeURIComponent(id)}`, ItemResponse);

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const item = result.data;
  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${item.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const actions = (
    <>
      {history}
      <ItemActions item={item} />
    </>
  );
  const approval = (
    <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionApproval}</h2>
      <KeyValueGrid
        items={[
          { label: t.infoApproval, value: <ItemStatusChip status={item.status} /> },
          {
            label: terminology.masters.columnStatus,
            value: <ActiveStatus isActive={item.isActive} />,
          },
          { label: t.infoSubmitted, value: actorLine(item.submittedBy, item.submittedAt) },
          { label: t.infoDecided, value: actorLine(item.decidedBy, item.decidedAt) },
          { label: t.infoDecisionRemarks, value: item.decisionRemarks ?? notSet },
          { label: terminology.masters.infoCreated, value: formatDateTime(item.createdAt) },
          { label: terminology.masters.infoUpdated, value: formatDateTime(item.updatedAt) },
        ]}
      />
    </section>
  );

  if (!item.canEdit) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={item.description} subtitle={item.code} actions={actions} />
        {approval}
        <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
          {permissions.includes('masters.items.manage') ? (
            <p className="mb-3 text-sm text-muted-foreground">{t.lockedNotice}</p>
          ) : null}
          <KeyValueGrid
            items={[
              { label: t.columnCode, value: item.code },
              { label: t.fieldDescription, value: item.description },
              { label: t.fieldSize, value: item.size ?? notSet },
              {
                label: t.fieldCategory,
                value: `${item.category.code} ${item.category.name}`,
              },
              { label: t.fieldUnit, value: `${item.unit.code} ${item.unit.name}` },
              { label: t.fieldUse, value: t.uses[item.itemUse] },
              { label: t.fieldHsn, value: item.hsnCode ?? notSet },
              { label: t.fieldGstRate, value: item.gstRate ?? notSet },
              { label: t.fieldRemarks, value: item.remarks ?? notSet },
            ]}
          />
        </section>
      </div>
    );
  }

  // canEdit implies masters.items.manage, which the option endpoints need.
  const [categories, units] = await Promise.all([
    apiGet('/api/item-categories/options', ItemCategoryOptionsResponse),
    apiGet('/api/units/options', ItemUnitOptionsResponse),
  ]);

  if (categories.kind !== 'ok' || units.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  // An inactive category or unit already on the item stays selectable for this item only.
  const categoryOptions = withSelectedOption(
    categories.data.items.map((c) => ({ value: c.id, label: c.label })),
    item.category.id,
    `${item.category.code} ${item.category.name} ${t.inactiveSuffix}`,
  );
  const unitOptions = withSelectedOption(
    units.data.items.map((u) => ({ value: u.id, label: u.label })),
    item.unit.id,
    `${item.unit.code} ${item.unit.name} ${t.inactiveSuffix}`,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.editTitle}
        subtitle={`${item.code} ${item.description}`}
        actions={actions}
      />
      {approval}
      <ItemForm item={item} categoryOptions={categoryOptions} unitOptions={unitOptions} />
    </div>
  );
}
