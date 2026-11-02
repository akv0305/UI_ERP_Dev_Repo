'use client';

import type { PurchaseOrderDetailResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { purchaseOrderErrorMessage } from '../_components/purchase-order-errors';

type PurchaseOrderAction = 'submit' | 'cancel';

const t = terminology.purchaseOrders.workflow;

const ACTIONS: Record<
  PurchaseOrderAction,
  {
    label: string;
    title: string;
    description: string;
    success: string;
    remarksRequired: boolean;
    tone: 'default' | 'danger';
  }
> = {
  submit: {
    label: t.submit,
    title: t.submitTitle,
    description: t.submitDescription,
    success: t.submittedMessage,
    remarksRequired: false,
    tone: 'default',
  },
  cancel: {
    label: t.cancel,
    title: t.cancelTitle,
    description: t.cancelDescription,
    success: t.cancelledMessage,
    remarksRequired: true,
    tone: 'danger',
  },
};

/** Submit (Draft) and Cancel (Draft or Submitted); each shown only when the API flags allow it. */
export function PurchaseOrderActions({
  purchaseOrder,
}: {
  purchaseOrder: PurchaseOrderDetailResponse;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<PurchaseOrderAction | null>(null);
  const [remarks, setRemarks] = useState('');

  const available: PurchaseOrderAction[] = [
    ...(purchaseOrder.canEdit ? (['submit'] as const) : []),
    ...(purchaseOrder.canCancel ? (['cancel'] as const) : []),
  ];

  async function run(action: PurchaseOrderAction, text: string): Promise<void> {
    const body = action === 'cancel' ? { remarks: text.trim() } : undefined;
    const result = await apiRequest(
      'POST',
      `/api/purchase-orders/${purchaseOrder.id}/${action}`,
      body,
    );

    if (result.ok) {
      toast.success(ACTIONS[action].success);
      router.refresh();
    } else {
      toast.error(purchaseOrderErrorMessage(result.code));
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
          variant={action === 'submit' ? 'default' : 'outline'}
          onClick={() => setOpen(action)}
        >
          {ACTIONS[action].label}
        </Button>
      ))}
      {open !== null && config !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => (next ? undefined : close())}
          title={config.title}
          description={config.description}
          confirmLabel={config.label}
          tone={config.tone}
          confirmDisabled={config.remarksRequired && remarks.trim().length === 0}
          onConfirm={() => void run(open, remarks)}
        >
          {config.remarksRequired ? (
            <div className="mt-3 space-y-1">
              <Label htmlFor="purchase-order-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="purchase-order-action-remarks"
                rows={3}
                maxLength={500}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t.remarksRequiredHint}</p>
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
