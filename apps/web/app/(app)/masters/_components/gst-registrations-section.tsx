'use client';

import type { StateResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDate } from '@/lib/format';
import { stateLabel } from '@/lib/state-options';
import { ActiveStatus } from './active-status';
import { DetailTable, type DetailColumn } from './detail-table';
import { GstRegistrationDialog, type GstRow } from './gst-registration-dialog';
import { StatusToggle, type StatusToggleLabels } from './status-toggle';

const g = terminology.gstRegistrations;

export type GstSectionLabels = StatusToggleLabels & { empty: string };

const columns: DetailColumn<GstRow>[] = [
  { key: 'gstin', header: g.columnGstin, className: 'font-mono', cell: (row) => row.gstin },
  { key: 'state', header: g.columnState, cell: (row) => stateLabel(row.state) },
  { key: 'type', header: g.columnType, cell: (row) => g.types[row.registrationType] },
  {
    key: 'effectiveFrom',
    header: g.columnEffectiveFrom,
    cell: (row) =>
      row.effectiveFrom === null ? terminology.labels.notSet : formatDate(row.effectiveFrom),
  },
  {
    key: 'status',
    header: g.columnStatus,
    cell: (row) => <ActiveStatus isActive={row.isActive} />,
  },
];

export interface GstRegistrationsSectionProps {
  /** POST target for a new row. */
  createPath: string;
  /** Base path of existing rows; /<id>, /<id>/deactivate and /<id>/reactivate are added. */
  rowPath: string;
  registrations: GstRow[];
  states: StateResponse[];
  /** Shows Add, Edit and Deactivate/Reactivate. */
  canManage: boolean;
  labels?: GstSectionLabels;
  /** Optional hint under the title, for example why the rows are locked. */
  notice?: string | null;
}

export function GstRegistrationsSection({
  createPath,
  rowPath,
  registrations,
  states,
  canManage,
  labels = terminology.gstRegistrations,
  notice = null,
}: GstRegistrationsSectionProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GstRow | undefined>(undefined);

  function openDialog(registration?: GstRow): void {
    setEditing(registration);
    setDialogOpen(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-(--card-padding)">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{g.title}</h2>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => openDialog()}>
            {g.add}
          </Button>
        ) : null}
      </div>
      {notice === null ? null : <p className="text-sm text-muted-foreground">{notice}</p>}

      {registrations.length === 0 ? (
        <EmptyState title={labels.empty} />
      ) : (
        <DetailTable
          columns={columns}
          rows={registrations}
          actions={
            canManage
              ? (registration) => (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog(registration)}
                    >
                      {terminology.actions.edit}
                    </Button>
                    <StatusToggle
                      isActive={registration.isActive}
                      path={`${rowPath}/${registration.id}`}
                      labels={labels}
                      onChanged={router.refresh}
                    />
                  </>
                )
              : undefined
          }
        />
      )}

      {canManage ? (
        <GstRegistrationDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          createPath={createPath}
          rowPath={rowPath}
          registration={editing}
          states={states}
          onSaved={router.refresh}
        />
      ) : null}
    </section>
  );
}
