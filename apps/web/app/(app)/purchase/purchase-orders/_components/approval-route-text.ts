import {
  compareAmounts,
  type ApprovalAmountBasis,
  type ApprovalRouteStepResponse,
} from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { formatDateTime, formatINR } from '@/lib/format';

/** Display helpers for the approval route (kept out of JSX for react/jsx-no-literals). */

const a = terminology.purchaseOrders.approval;

export function versionText(version: number): string {
  return `${a.versionPrefix} ${version}`;
}

/** NET_AMOUNT = lines after discount (subtotal); GRAND_TOTAL = grand total (OQ-109). */
export function routeValueText(
  purchaseOrder: { subtotal: string; grandTotal: string },
  basis: ApprovalAmountBasis,
): string {
  return formatINR(basis === 'GRAND_TOTAL' ? purchaseOrder.grandTotal : purchaseOrder.subtotal);
}

export function appliesWhenText(minAmount: string): string {
  return compareAmounts(minAmount, '0') === 0
    ? a.always
    : `${a.abovePrefix} ${formatINR(minAmount)}`;
}

export function roleText(step: ApprovalRouteStepResponse): string {
  return step.routedRole === null
    ? step.role.name
    : `${step.role.name} ${a.routedTo} ${step.routedRole.name}`;
}

export function approverText(step: ApprovalRouteStepResponse, notSet: string): string {
  return step.approver?.displayName ?? notSet;
}

export function decisionText(step: ApprovalRouteStepResponse, notSet: string): string {
  return step.decision === null ? notSet : a.decisions[step.decision];
}

export function decidedAtText(step: ApprovalRouteStepResponse, notSet: string): string {
  return step.decidedAt === null ? notSet : formatDateTime(step.decidedAt);
}

export function stepRemarksText(step: ApprovalRouteStepResponse, notSet: string): string {
  const parts = [
    step.remarks,
    step.routeReason === null ? null : `${a.routeReasonPrefix} ${step.routeReason}`,
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? notSet : parts.join(' · ');
}

export function nextLevelText(next: { levelNo: number; role: { name: string } }): string {
  return `${a.nextLevelPrefix} ${next.levelNo} · ${next.role.name}`;
}
