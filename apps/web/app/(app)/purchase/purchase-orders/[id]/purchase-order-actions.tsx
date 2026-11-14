'use client';

import type { ApprovalRouteResponse, PurchaseOrderDetailResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { terminology } from '@/config/terminology';
import { apiRequest } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { nextLevelText } from '../_components/approval-route-text';
import { purchaseOrderErrorMessage } from '../_components/purchase-order-errors';

type PurchaseOrderAction = 'submit' | 'approve' | 'reject' | 'cancel' | 'reassign' | 'routeHigher';
type RemarksRule = 'none' | 'optional' | 'required';

const t = terminology.purchaseOrders.workflow;
const a = terminology.purchaseOrders.approval;
const warningClass =
  'mt-3 rounded-md border border-status-returned/40 bg-status-returned/10 px-3 py-2 text-sm text-status-returned';

const ACTIONS: Record<
  PurchaseOrderAction,
  {
    label: string;
    title: string;
    description: string;
    success: string;
    remarks: RemarksRule;
    tone: 'default' | 'danger';
    path: string;
  }
> = {
  submit: {
    label: t.submit,
    title: t.submitTitle,
    description: t.submitDescription,
    success: t.submittedMessage,
    remarks: 'none',
    tone: 'default',
    path: 'submit',
  },
  approve: {
    label: a.approve,
    title: a.approveTitle,
    description: a.approveDescription,
    success: a.approvedMessage,
    remarks: 'optional',
    tone: 'default',
    path: 'approve',
  },
  reject: {
    label: a.reject,
    title: a.rejectTitle,
    description: a.rejectDescription,
    success: a.rejectedMessage,
    remarks: 'required',
    tone: 'danger',
    path: 'reject',
  },
  cancel: {
    label: t.cancel,
    title: t.cancelTitle,
    description: t.cancelDescription,
    success: t.cancelledMessage,
    remarks: 'required',
    tone: 'danger',
    path: 'cancel',
  },
  reassign: {
    label: a.reassign,
    title: a.reassignTitle,
    description: a.reassignDescription,
    success: a.reassignedMessage,
    remarks: 'required',
    tone: 'default',
    path: 'approval-route/reassign',
  },
  routeHigher: {
    label: a.routeHigher,
    title: a.routeHigherTitle,
    description: a.routeHigherDescription,
    success: a.routedMessage,
    remarks: 'required',
    tone: 'default',
    path: 'approval-route/route-higher',
  },
};

interface PickOption {
  id: string;
  label: string;
}

function PickSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: PickOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={a.choosePlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function actorOptions(actors: readonly { id: string; displayName: string }[]): PickOption[] {
  return actors.map((actor) => ({ id: actor.id, label: actor.displayName }));
}

/**
 * Submit, Approve / Reject (current approver), admin Reassign / Route to higher role (OQ-118, OQ-119)
 * and Cancel. Each is shown only when the API flags or the route allow it.
 */
export function PurchaseOrderActions({
  purchaseOrder,
  route,
}: {
  purchaseOrder: PurchaseOrderDetailResponse;
  route: ApprovalRouteResponse | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<PurchaseOrderAction | null>(null);
  const [remarks, setRemarks] = useState('');
  const [approverId, setApproverId] = useState('');
  const [roleId, setRoleId] = useState('');

  const next = route?.next ?? null;
  const admin = route?.admin ?? null;
  const higherRole = admin?.higherRoles.find((entry) => entry.role.id === roleId) ?? null;
  const nextNeedsChoice = next !== null && next.candidates.length > 1;

  const available: PurchaseOrderAction[] = [
    ...(purchaseOrder.canEdit ? (['submit'] as const) : []),
    ...(route?.canDecide === true ? (['approve', 'reject'] as const) : []),
    ...(admin !== null && admin.candidates.length > 0 ? (['reassign'] as const) : []),
    ...(admin !== null && admin.status === 'ON_HOLD' && admin.higherRoles.length > 0
      ? (['routeHigher'] as const)
      : []),
    ...(purchaseOrder.canCancel ? (['cancel'] as const) : []),
  ];

  function picksNext(action: PurchaseOrderAction): boolean {
    return action === 'submit' || action === 'approve';
  }

  function bodyFor(action: PurchaseOrderAction, text: string): Record<string, unknown> {
    const trimmed = text.trim();
    const nextApproverId = nextNeedsChoice ? approverId : null;

    switch (action) {
      case 'submit':
        return { nextApproverId };
      case 'approve':
        return { remarks: trimmed.length === 0 ? null : trimmed, nextApproverId };
      case 'reject':
      case 'cancel':
        return { remarks: trimmed };
      case 'reassign':
        return { approverId, remarks: trimmed };
      case 'routeHigher':
        return { roleId, approverId, reason: trimmed };
    }
  }

  function isConfirmDisabled(action: PurchaseOrderAction): boolean {
    if (ACTIONS[action].remarks === 'required' && remarks.trim().length === 0) {
      return true;
    }

    if (picksNext(action) && nextNeedsChoice && approverId === '') {
      return true;
    }

    if (action === 'reassign' && approverId === '') {
      return true;
    }

    return action === 'routeHigher' && (roleId === '' || approverId === '');
  }

  async function run(action: PurchaseOrderAction, text: string): Promise<void> {
    const result = await apiRequest(
      'POST',
      `/api/purchase-orders/${purchaseOrder.id}/${ACTIONS[action].path}`,
      bodyFor(action, text),
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
    setApproverId('');
    setRoleId('');
  }

  const config = open === null ? null : ACTIONS[open];

  return (
    <>
      {available.map((action) => (
        <Button
          key={action}
          type="button"
          variant={action === 'submit' || action === 'approve' ? 'default' : 'outline'}
          onClick={() => setOpen(action)}
        >
          {ACTIONS[action].label}
        </Button>
      ))}
      {open !== null && config !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(value) => (value ? undefined : close())}
          title={config.title}
          description={config.description}
          confirmLabel={config.label}
          tone={config.tone}
          confirmDisabled={isConfirmDisabled(open)}
          onConfirm={() => void run(open, remarks)}
        >
          {picksNext(open) && route !== null && route.problem !== null ? (
            <p className={warningClass}>{route.problem}</p>
          ) : null}
          {picksNext(open) && next !== null ? (
            <div className="mt-3 space-y-1">
              <p className="text-sm font-medium text-foreground">{nextLevelText(next)}</p>
              {next.candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">{a.noCandidates}</p>
              ) : next.candidates.length === 1 ? (
                <p className="text-sm text-foreground">{next.candidates[0]?.displayName}</p>
              ) : (
                <PickSelect
                  id="purchase-order-action-approver"
                  label={a.approverLabel}
                  options={actorOptions(next.candidates)}
                  value={approverId}
                  onChange={setApproverId}
                />
              )}
            </div>
          ) : null}
          {open === 'reassign' && admin !== null ? (
            <PickSelect
              id="purchase-order-action-approver"
              label={a.approverLabel}
              options={actorOptions(admin.candidates)}
              value={approverId}
              onChange={setApproverId}
            />
          ) : null}
          {open === 'routeHigher' && admin !== null ? (
            <>
              <PickSelect
                id="purchase-order-action-role"
                label={a.higherRoleLabel}
                options={admin.higherRoles.map((entry) => ({
                  id: entry.role.id,
                  label: entry.role.name,
                }))}
                value={roleId}
                onChange={(value) => {
                  setRoleId(value);
                  setApproverId('');
                }}
              />
              <PickSelect
                id="purchase-order-action-approver"
                label={a.approverLabel}
                options={actorOptions(higherRole?.candidates ?? [])}
                value={approverId}
                onChange={setApproverId}
              />
            </>
          ) : null}
          {config.remarks === 'none' ? null : (
            <div className="mt-3 space-y-1">
              <Label htmlFor="purchase-order-action-remarks">{t.remarksLabel}</Label>
              <Textarea
                id="purchase-order-action-remarks"
                rows={3}
                maxLength={500}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {config.remarks === 'required' ? t.remarksRequiredHint : a.remarksOptionalHint}
              </p>
            </div>
          )}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
