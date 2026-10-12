'use client';

import type { GstRegistrationResponse, StateResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { formatDate } from '@/lib/format';
import { stateLabel } from '@/lib/state-options';
import { ActiveStatus } from '../../_components/active-status';
import { StatusToggle } from '../../_components/status-toggle';
import { GstRegistrationDialog } from './gst-registration-dialog';

export interface GstRegistrationsSectionProps {
  companyId: string;
  registrations: GstRegistrationResponse[];
  states: StateResponse[];
  canManage: boolean;
}

const HEADER_CLASS =
  'h-[var(--row-height)] px-3 text-left text-xs font-medium uppercase text-muted-foreground';

export function GstRegistrationsSection({
  companyId,
  registrations,
  states,
  canManage,
}: GstRegistrationsSectionProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GstRegistrationResponse | undefined>(undefined);

  function openDialog(registration?: GstRegistrationResponse): void {
    setEditing(registration);
    setDialogOpen(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-[var(--card-padding)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {terminology.gstRegistrations.title}
        </h2>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => openDialog()}>
            {terminology.gstRegistrations.add}
          </Button>
        ) : null}
      </div>

      {registrations.length === 0 ? (
        <EmptyState title={terminology.gstRegistrations.empty} />
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted">
              <tr className="border-b border-border">
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.gstRegistrations.columnGstin}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.gstRegistrations.columnState}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.gstRegistrations.columnType}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.gstRegistrations.columnEffectiveFrom}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.gstRegistrations.columnStatus}
                </th>
                {canManage ? (
                  <th scope="col" className={HEADER_CLASS}>
                    {terminology.actions.actions}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => (
                <tr key={registration.id} className="border-b border-border last:border-0">
                  <td className="h-[var(--row-height)] px-3 font-mono text-foreground">
                    {registration.gstin}
                  </td>
                  <td className="px-3 text-foreground">{stateLabel(registration.state)}</td>
                  <td className="px-3 text-foreground">
                    {terminology.gstRegistrations.types[registration.registrationType]}
                  </td>
                  <td className="px-3 text-foreground">
                    {registration.effectiveFrom === null
                      ? terminology.labels.notSet
                      : formatDate(registration.effectiveFrom)}
                  </td>
                  <td className="px-3">
                    <ActiveStatus isActive={registration.isActive} />
                  </td>
                  {canManage ? (
                    <td className="px-3">
                      <div className="flex items-center gap-2">
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
                          path={`/api/gst-registrations/${registration.id}`}
                          labels={terminology.gstRegistrations}
                          onChanged={router.refresh}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <GstRegistrationDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          companyId={companyId}
          registration={editing}
          states={states}
          onSaved={router.refresh}
        />
      ) : null}
    </section>
  );
}
