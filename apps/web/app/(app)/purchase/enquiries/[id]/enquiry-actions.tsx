'use client';

import type { EnquiryDetailResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

type EnquiryAction = 'send' | 'close' | 'cancel';

const t = terminology.enquiries;

const ACTIONS: Record<
  EnquiryAction,
  {
    label: string;
    title: string;
    description: string;
    success: string;
    remarksRequired: boolean;
    tone: 'default' | 'danger';
  }
> = {
  send: {
    label: t.send,
    title: t.sendTitle,
    description: t.sendDescription,
    success: t.sentMessage,
    remarksRequired: false,
    tone: 'default',
  },
  close: {
    label: t.closeEnquiry,
    title: t.closeTitle,
    description: t.closeDescription,
    success: t.closedMessage,
    remarksRequired: false,
    tone: 'default',
  },
  cancel: {
    label: t.cancelEnquiry,
    title: t.cancelTitle,
    description: t.cancelDescription,
    success: t.cancelledMessage,
    remarksRequired: true,
    tone: 'danger',
  },
};

/** Workflow buttons; each is shown only when the API flags say the user may use it. */
export function EnquiryActions({ enquiry }: { enquiry: EnquiryDetailResponse }) {
  const router = useRouter();
  const [open, setOpen] = useState<EnquiryAction | null>(null);
  const [remarks, setRemarks] = useState('');

  const available: EnquiryAction[] = [
    ...(enquiry.canEdit ? (['send'] as const) : []),
    ...(enquiry.canClose ? (['close'] as const) : []),
    ...(enquiry.canCancel ? (['cancel'] as const) : []),
  ];

  async function run(action: EnquiryAction, text: string): Promise<void> {
    const body = action === 'cancel' ? { remarks: text.trim() } : undefined;
    const result = await apiRequest('POST', `/api/enquiries/${enquiry.id}/${action}`, body);

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
          variant={action === 'send' ? 'default' : 'outline'}
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
              <Label htmlFor="enquiry-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="enquiry-action-remarks"
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
