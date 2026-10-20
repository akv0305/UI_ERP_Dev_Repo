'use client';

import type { VendorBankAccountResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { ActiveStatus } from '../../_components/active-status';
import { DetailTable, type DetailColumn } from '../../_components/detail-table';
import { StatusToggle } from '../../_components/status-toggle';
import { BankAccountDialog } from './bank-account-dialog';

const t = terminology.vendorBank;
const notSet = terminology.labels.notSet;

const columns: DetailColumn<VendorBankAccountResponse>[] = [
  { key: 'accountName', header: t.columnAccountName, cell: (row) => row.accountName },
  {
    key: 'accountNumber',
    header: t.columnAccountNumber,
    className: 'font-mono',
    cell: (row) => row.accountNumber,
  },
  { key: 'ifsc', header: t.columnIfsc, className: 'font-mono', cell: (row) => row.ifsc },
  { key: 'bank', header: t.columnBank, cell: (row) => row.bankName },
  { key: 'branch', header: t.columnBranch, cell: (row) => row.branchName ?? notSet },
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

export interface BankAccountsSectionProps {
  vendorId: string;
  accounts: VendorBankAccountResponse[];
  /** Vendor is active, Draft or Rejected, and the user may manage vendors. */
  canEdit: boolean;
  notice: string | null;
}

export function BankAccountsSection({
  vendorId,
  accounts,
  canEdit,
  notice,
}: BankAccountsSectionProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorBankAccountResponse | undefined>(undefined);

  function openDialog(account?: VendorBankAccountResponse): void {
    setEditing(account);
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
      {notice === null ? null : <p className="text-sm text-muted-foreground">{notice}</p>}

      {accounts.length === 0 ? (
        <EmptyState title={t.empty} />
      ) : (
        <DetailTable
          columns={columns}
          rows={accounts}
          actions={
            canEdit
              ? (account) => (
                  <>
                    {account.isActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(account)}
                      >
                        {terminology.actions.edit}
                      </Button>
                    ) : null}
                    <StatusToggle
                      isActive={account.isActive}
                      path={`/api/vendor-bank-accounts/${account.id}`}
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
        <BankAccountDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          vendorId={vendorId}
          account={editing}
          onSaved={router.refresh}
        />
      ) : null}
    </section>
  );
}
