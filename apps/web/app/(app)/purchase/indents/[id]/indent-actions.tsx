'use client';

import { QUANTITY_PATTERN, type IndentDetailResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { formatQty } from '@/lib/format';
import * as toast from '@/lib/toast';

type IndentAction = 'submit' | 'approve' | 'reject' | 'cancel';

const t = terminology.indents;

const ACTIONS: Record<
  IndentAction,
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
  cancel: {
    label: t.cancelIndent,
    title: t.cancelTitle,
    description: t.cancelDescription,
    success: t.cancelledMessage,
    remarks: 'required',
    tone: 'danger',
  },
};

/** "10.000" -> "10", "2.500" -> "2.5": the approved-qty box starts at the required qty. */
function plainQty(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

type IndentLine = IndentDetailResponse['lines'][number];

/** "1. ITM-000012 Cement OPC 53" */
function lineLabel(line: IndentLine): string {
  return `${line.lineNo}. ${line.item.code} ${line.item.description}`;
}

/** "10.000 BAG" formatted to the unit's decimals. */
function requiredWithUnit(line: IndentLine): string {
  return `${formatQty(line.requiredQty, line.item.decimalPlaces)} ${line.item.unitCode}`;
}

/** Workflow buttons; each is shown only when the API flags say the user may use it. */
export function IndentActions({ indent }: { indent: IndentDetailResponse }) {
  const router = useRouter();
  const [open, setOpen] = useState<IndentAction | null>(null);
  const [remarks, setRemarks] = useState('');
  const [approved, setApproved] = useState<Record<string, string>>({});

  const available: IndentAction[] = [
    ...(indent.canEdit ? (['submit'] as const) : []),
    ...(indent.canApprove ? (['approve', 'reject'] as const) : []),
    ...(indent.canCancel ? (['cancel'] as const) : []),
  ];

  function start(action: IndentAction): void {
    if (action === 'approve') {
      setApproved(
        Object.fromEntries(indent.lines.map((line) => [line.id, plainQty(line.requiredQty)])),
      );
    }

    setOpen(action);
  }

  async function run(action: IndentAction, text: string): Promise<void> {
    let body: unknown;

    if (action === 'approve') {
      body = {
        lines: indent.lines.map((line) => ({
          lineId: line.id,
          approvedQty: (approved[line.id] ?? '').trim(),
        })),
        remarks: text.trim(),
      };
    } else if (action !== 'submit') {
      body = { remarks: text.trim() };
    }

    const result = await apiRequest('POST', `/api/indents/${indent.id}/${action}`, body);

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
  const qtyInvalid =
    open === 'approve' &&
    indent.lines.some((line) => !QUANTITY_PATTERN.test((approved[line.id] ?? '').trim()));

  return (
    <>
      {available.map((action) => (
        <Button
          key={action}
          type="button"
          variant={action === 'reject' || action === 'cancel' ? 'outline' : 'default'}
          onClick={() => start(action)}
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
          confirmDisabled={
            qtyInvalid || (config.remarks === 'required' && remarks.trim().length === 0)
          }
          onConfirm={() => void run(open, remarks)}
        >
          {open === 'approve' ? (
            <div className="mt-3 max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">{t.columnItem}</th>
                    <th className="px-2 py-2 text-right font-medium">{t.columnRequiredQty}</th>
                    <th className="w-32 px-2 py-2 font-medium">{t.columnApprovedQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {indent.lines.map((line) => (
                    <tr key={line.id} className="border-b border-border">
                      <td className="px-2 py-2">
                        <span className="block truncate">{lineLabel(line)}</span>
                      </td>
                      <td className="px-2 py-2 text-right">{requiredWithUnit(line)}</td>
                      <td className="px-2 py-2">
                        <Input
                          inputMode="decimal"
                          aria-label={t.columnApprovedQty}
                          value={approved[line.id] ?? ''}
                          onChange={(event) =>
                            setApproved((previous) => ({
                              ...previous,
                              [line.id]: event.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {config.remarks === 'none' ? null : (
            <div className="mt-3 space-y-1">
              <Label htmlFor="indent-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="indent-action-remarks"
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
