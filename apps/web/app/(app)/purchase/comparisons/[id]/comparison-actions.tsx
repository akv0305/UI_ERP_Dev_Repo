'use client';

import type { ComparisonDetailResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { comparisonErrorMessage } from '../_components/comparison-text';

type ComparisonAction = 'finalise' | 'cancel';

const t = terminology.comparisonActions;

const ACTIONS: Record<
  ComparisonAction,
  {
    label: string;
    title: string;
    description: string;
    success: string;
    remarksRequired: boolean;
    tone: 'default' | 'danger';
  }
> = {
  finalise: {
    label: t.finalise,
    title: t.finaliseTitle,
    description: t.finaliseDescription,
    success: t.finalisedMessage,
    remarksRequired: false,
    tone: 'default',
  },
  cancel: {
    label: t.cancelComparison,
    title: t.cancelTitle,
    description: t.cancelDescription,
    success: t.cancelledMessage,
    remarksRequired: true,
    tone: 'danger',
  },
};

/** Workflow buttons; each is shown only when the API flags say the user may use it. */
export function ComparisonActions({ comparison }: { comparison: ComparisonDetailResponse }) {
  const router = useRouter();
  const [open, setOpen] = useState<ComparisonAction | null>(null);
  const [remarks, setRemarks] = useState('');

  const available: ComparisonAction[] = [
    ...(comparison.canFinalise ? (['finalise'] as const) : []),
    ...(comparison.canCancel ? (['cancel'] as const) : []),
  ];

  async function run(action: ComparisonAction, text: string): Promise<void> {
    const body = action === 'cancel' ? { remarks: text.trim() } : undefined;
    const result = await apiRequest('POST', `/api/comparisons/${comparison.id}/${action}`, body);

    if (result.ok) {
      toast.success(ACTIONS[action].success);
      router.refresh();
    } else {
      toast.error(comparisonErrorMessage(result.code));
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
          variant={action === 'finalise' ? 'default' : 'outline'}
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
              <Label htmlFor="comparison-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="comparison-action-remarks"
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
