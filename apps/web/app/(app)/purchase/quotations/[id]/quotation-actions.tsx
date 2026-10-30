'use client';

import type { QuotationDetailResponse, QuotationResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

type QuotationAction = 'submit' | 'revise' | 'cancel';

const t = terminology.quotationActions;

const ACTIONS: Record<
  QuotationAction,
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
  revise: {
    label: t.revise,
    title: t.reviseTitle,
    description: t.reviseDescription,
    success: t.revisedMessage,
    remarksRequired: false,
    tone: 'default',
  },
  cancel: {
    label: t.cancelQuotation,
    title: t.cancelTitle,
    description: t.cancelDescription,
    success: t.cancelledMessage,
    remarksRequired: true,
    tone: 'danger',
  },
};

/** Workflow buttons; each is shown only when the API flags say the user may use it. */
export function QuotationActions({ quotation }: { quotation: QuotationDetailResponse }) {
  const router = useRouter();
  const [open, setOpen] = useState<QuotationAction | null>(null);
  const [remarks, setRemarks] = useState('');

  const available: QuotationAction[] = [
    ...(quotation.canEdit ? (['submit'] as const) : []),
    ...(quotation.canRevise ? (['revise'] as const) : []),
    ...(quotation.canCancel ? (['cancel'] as const) : []),
  ];

  async function run(action: QuotationAction, text: string): Promise<void> {
    const body = action === 'cancel' ? { remarks: text.trim() } : undefined;
    const result = await apiRequest<QuotationResponse>(
      'POST',
      `/api/quotations/${quotation.id}/${action}`,
      body,
    );

    if (!result.ok) {
      toast.error(messageForApiError(result.code));
      return;
    }

    toast.success(ACTIONS[action].success);

    if (action === 'revise') {
      // The new Draft revision has its own id; open it for editing.
      router.push(`/purchase/quotations/${result.data.id}/edit`);
      return;
    }

    router.refresh();
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
              <Label htmlFor="quotation-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="quotation-action-remarks"
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
