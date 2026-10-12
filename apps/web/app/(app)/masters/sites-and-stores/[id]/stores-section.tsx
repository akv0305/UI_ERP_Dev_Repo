'use client';

import type { StoreResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { ActiveStatus } from '../../_components/active-status';
import { StatusToggle } from '../../_components/status-toggle';
import { StoreDialog } from './store-dialog';

export interface StoresSectionProps {
  siteId: string;
  stores: StoreResponse[];
  canManage: boolean;
}

const HEADER_CLASS =
  'h-[var(--row-height)] px-3 text-left text-xs font-medium uppercase text-muted-foreground';

export function StoresSection({ siteId, stores, canManage }: StoresSectionProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StoreResponse | undefined>(undefined);

  function openDialog(store?: StoreResponse): void {
    setEditing(store);
    setDialogOpen(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-[var(--card-padding)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{terminology.stores.title}</h2>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => openDialog()}>
            {terminology.stores.add}
          </Button>
        ) : null}
      </div>

      {stores.length === 0 ? (
        <EmptyState title={terminology.stores.empty} />
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted">
              <tr className="border-b border-border">
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.stores.columnCode}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.stores.columnName}
                </th>
                <th scope="col" className={HEADER_CLASS}>
                  {terminology.stores.columnStatus}
                </th>
                {canManage ? (
                  <th scope="col" className={HEADER_CLASS}>
                    {terminology.actions.actions}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} className="border-b border-border last:border-0">
                  <td className="h-[var(--row-height)] px-3 text-foreground">{store.code}</td>
                  <td className="px-3 text-foreground">{store.name}</td>
                  <td className="px-3">
                    <ActiveStatus isActive={store.isActive} />
                  </td>
                  {canManage ? (
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog(store)}
                        >
                          {terminology.actions.edit}
                        </Button>
                        <StatusToggle
                          isActive={store.isActive}
                          path={`/api/stores/${store.id}`}
                          labels={terminology.stores}
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
        <StoreDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          siteId={siteId}
          store={editing}
          onSaved={router.refresh}
        />
      ) : null}
    </section>
  );
}
