'use client';

import type { VendorResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { StatusToggle } from '../../_components/status-toggle';

type VendorAction = 'submit' | 'approve' | 'reject' | 'reopen';

const t = terminology.vendors;

const ACTIONS: Record<
  VendorAction,
  {
    label: string;
    title: string;
    description: string;
    success: string;
    remarks: 'none' | 'optional' | 'required';
    tone: 'default' | 'danger';
  }
> = {
  submit: {
    label: t.submit,
    title: t.submitTitle,
    description: t.submitDescription,
    success: t.submittedMessage,
    remarks: 'none',
    tone: 'default',
  },
  approve: {
    label: t.approve,
    title: t.approveTitle,
    description: t.approveDescription,
    success: t.approvedMessage,
    remarks: 'optional',
    tone: 'default',
  },
  reject: {
    label: t.reject,
    title: t.rejectTitle,
    description: t.rejectDescription,
    success: t.rejectedMessage,
    remarks: 'required',
    tone: 'danger',
  },
  reopen: {
    label: t.reopen,
    title: t.reopenTitle,
    description: t.reopenDescription,
    success: t.reopenedMessage,
    remarks: 'required',
    tone: 'default',
  },
};

/** Workflow buttons; each is shown only when the API flags say the user may use it. */
export function VendorActions({ vendor }: { vendor: VendorResponse }) {
  const router = useRouter();
  const [open, setOpen] = useState<VendorAction | null>(null);
  const [remarks, setRemarks] = useState('');

  const available: VendorAction[] = [
    ...(vendor.canEdit ? (['submit'] as const) : []),
    ...(vendor.canApprove ? (['approve', 'reject'] as const) : []),
    ...(vendor.canReopen ? (['reopen'] as const) : []),
  ];

  async function run(action: VendorAction, text: string): Promise<void> {
    const body = ACTIONS[action].remarks === 'none' ? undefined : { remarks: text.trim() };
    const result = await apiRequest('POST', `/api/vendors/${vendor.id}/${action}`, body);

    if (result.ok) {
      toast.success(ACTIONS[action].success);
      router.refresh();
    } else {
      toast.error(messageForApiError(result.code));
    }
  }

  function close(): void {
    setOpen(null);
    setRemarks('');
  }

  const config = open === null ? null : ACTIONS[open];

  return (
    <>
      {available.map((action) => (
        <Button
          key={action}
          type="button"
          variant={action === 'reject' ? 'outline' : 'default'}
          onClick={() => setOpen(action)}
        >
          {ACTIONS[action].label}
        </Button>
      ))}
      {vendor.canManage ? (
        <StatusToggle
          isActive={vendor.isActive}
          path={`/api/vendors/${vendor.id}`}
          labels={t}
          onChanged={router.refresh}
        />
      ) : null}
      {open !== null && config !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => (next ? undefined : close())}
          title={config.title}
          description={config.description}
          confirmLabel={config.label}
          tone={config.tone}
          confirmDisabled={config.remarks === 'required' && remarks.trim().length === 0}
          onConfirm={() => void run(open, remarks)}
        >
          {config.remarks === 'none' ? null : (
            <div className="mt-3 space-y-1">
              <Label htmlFor="vendor-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="vendor-action-remarks"
                rows={3}
                maxLength={500}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {config.remarks === 'required' ? t.remarksRequiredHint : t.remarksOptionalHint}
              </p>
            </div>
          )}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
