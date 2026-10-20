'use client';

import type { VendorContactResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { ActiveStatus } from '../../_components/active-status';
import { DetailTable, type DetailColumn } from '../../_components/detail-table';
import { StatusToggle } from '../../_components/status-toggle';
import { ContactDialog } from './contact-dialog';

const t = terminology.vendorContacts;
const notSet = terminology.labels.notSet;

const columns: DetailColumn<VendorContactResponse>[] = [
  { key: 'name', header: t.columnName, cell: (row) => row.name },
  { key: 'designation', header: t.columnDesignation, cell: (row) => row.designation ?? notSet },
  { key: 'phone', header: t.columnPhone, cell: (row) => row.phone ?? notSet },
  { key: 'email', header: t.columnEmail, cell: (row) => row.email ?? notSet },
  {
    key: 'primary',
    header: t.columnPrimary,
    cell: (row) => (row.isPrimary ? terminology.labels.yes : terminology.labels.no),
  },
  {
    key: 'status',
    header: t.columnStatus,
    cell: (row) => <ActiveStatus isActive={row.isActive} />,
  },
];

export interface ContactsSectionProps {
  vendorId: string;
  contacts: VendorContactResponse[];
  /** Vendor is active and the user may manage vendors (any approval status, OQ-35 d). */
  canEdit: boolean;
}

export function ContactsSection({ vendorId, contacts, canEdit }: ContactsSectionProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorContactResponse | undefined>(undefined);

  function openDialog(contact?: VendorContactResponse): void {
    setEditing(contact);
    setDialogOpen(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-(--card-padding)">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t.title}</h2>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => openDialog()}>
            {t.add}
          </Button>
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <EmptyState title={t.empty} />
      ) : (
        <DetailTable
          columns={columns}
          rows={contacts}
          actions={
            canEdit
              ? (contact) => (
                  <>
                    {contact.isActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(contact)}
                      >
                        {terminology.actions.edit}
                      </Button>
                    ) : null}
                    <StatusToggle
                      isActive={contact.isActive}
                      path={`/api/vendor-contacts/${contact.id}`}
                      labels={t}
                      onChanged={router.refresh}
                    />
                  </>
                )
              : undefined
          }
        />
      )}

      {canEdit ? (
        <ContactDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          vendorId={vendorId}
          contact={editing}
          onSaved={router.refresh}
        />
      ) : null}
    </section>
  );
}
