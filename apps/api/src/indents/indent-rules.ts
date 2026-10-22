import type { IndentStatus, Permission } from '@uie/contracts';
import type { AccessContext, ResolvedTarget } from '../access/access-context';

export const INDENT_VIEW: Permission = 'purchase.indents.view';
export const INDENT_MANAGE: Permission = 'purchase.indents.manage';
export const INDENT_APPROVE: Permission = 'purchase.indents.approve';

/** Statuses in which an indent may be edited, submitted or cancelled. */
export const EDITABLE_INDENT_STATUSES: readonly IndentStatus[] = ['DRAFT', 'REJECTED'];

export type IndentTarget = Pick<ResolvedTarget, 'companyId' | 'projectId' | 'siteId'>;

/** An indent is checked against its site; the row carries project and company, so no lookup. */
export function indentTargetOf(indent: {
  companyId: string;
  projectId: string;
  siteId: string;
}): IndentTarget {
  return { companyId: indent.companyId, projectId: indent.projectId, siteId: indent.siteId };
}

/** Visible with view, manage or approve over the indent's site. */
export function canSeeIndent(access: AccessContext, target: IndentTarget): boolean {
  return (
    access.canOn(INDENT_VIEW, target) ||
    access.canOn(INDENT_MANAGE, target) ||
    access.canOn(INDENT_APPROVE, target)
  );
}

export interface IndentFlags {
  canEdit: boolean;
  canApprove: boolean;
  canCancel: boolean;
}

export function indentFlagsFor(
  access: AccessContext,
  indent: {
    companyId: string;
    projectId: string;
    siteId: string;
    status: IndentStatus;
    createdById: string;
    submittedById: string | null;
  },
  actorId: string,
): IndentFlags {
  const target = indentTargetOf(indent);
  const manage = access.canOn(INDENT_MANAGE, target);
  const approve = access.canOn(INDENT_APPROVE, target);
  const editable = EDITABLE_INDENT_STATUSES.includes(indent.status);

  return {
    canEdit: manage && editable,
    canApprove:
      approve &&
      indent.status === 'PENDING_APPROVAL' &&
      indent.createdById !== actorId &&
      indent.submittedById !== actorId,
    canCancel: manage && editable,
  };
}

/** Today's date in IST (UTC+05:30) as YYYY-MM-DD. */
export function todayInIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Significant decimal places of a quantity string ("2.500" -> 1). */
export function decimalsOf(value: string): number {
  const fraction = value.split('.')[1] ?? '';

  return fraction.replace(/0+$/, '').length;
}

export function fitsUnit(value: string, decimalPlaces: number): boolean {
  return decimalsOf(value) <= decimalPlaces;
}

function normalized(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');

  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(3, '0')}`;
}

/** Compares two non-negative quantity strings (up to 3 decimals) without floats: -1, 0 or 1. */
export function compareQuantity(a: string, b: string): number {
  const left = normalized(a);
  const right = normalized(b);

  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1;
  }

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function isZeroQuantity(value: string): boolean {
  return compareQuantity(value, '0') === 0;
}

export interface ApprovalLine {
  id: string;
  lineNo: number;
  requiredQty: string;
  decimalPlaces: number;
}

/**
 * Approved quantities (OQ-40): one per line, 0..required, within the unit's decimals, not all 0.
 * Returns the error message, or null when the quantities are acceptable.
 */
export function checkApprovedQuantities(
  lines: readonly ApprovalLine[],
  approved: readonly { lineId: string; approvedQty: string }[],
): string | null {
  const byId = new Map(approved.map((entry) => [entry.lineId, entry.approvedQty]));

  if (byId.size !== lines.length || lines.some((line) => !byId.has(line.id))) {
    return 'Send an approved quantity for every line of this indent.';
  }

  let anyApproved = false;

  for (const line of lines) {
    const quantity = byId.get(line.id) ?? '0';

    if (!fitsUnit(quantity, line.decimalPlaces)) {
      return `Line ${line.lineNo}: the unit allows ${line.decimalPlaces} decimal place(s).`;
    }

    if (compareQuantity(quantity, line.requiredQty) > 0) {
      return `Line ${line.lineNo}: the approved quantity is more than the required quantity.`;
    }

    if (!isZeroQuantity(quantity)) {
      anyApproved = true;
    }
  }

  return anyApproved ? null : 'Every approved quantity is 0. Reject the indent instead.';
}
