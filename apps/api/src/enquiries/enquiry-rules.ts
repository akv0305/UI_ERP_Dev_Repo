import type { EnquiryStatus, Permission } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import {
  compareQuantity,
  fitsUnit,
  indentTargetOf,
  isZeroQuantity,
  type IndentTarget,
} from '../indents/indent-rules';

export const ENQUIRY_VIEW: Permission = 'purchase.enquiries.view';
export const ENQUIRY_MANAGE: Permission = 'purchase.enquiries.manage';

/** Only a draft may be edited or sent. */
export const EDITABLE_ENQUIRY_STATUSES: readonly EnquiryStatus[] = ['DRAFT'];

/** Draft or sent enquiries may be cancelled (PD-047). */
export const CANCELLABLE_ENQUIRY_STATUSES: readonly EnquiryStatus[] = ['DRAFT', 'SENT'];

/** Only numbered enquiries can be printed for vendors (OQ-52 A). */
export const PRINTABLE_ENQUIRY_STATUSES: readonly EnquiryStatus[] = ['SENT', 'CLOSED'];

/** Checked against the enquiry's site, like an indent; the row carries project and company. */
export function enquiryTargetOf(enquiry: {
  companyId: string;
  projectId: string;
  siteId: string;
}): IndentTarget {
  return indentTargetOf(enquiry);
}

/** Visible with view or manage over the enquiry's site. */
export function canSeeEnquiry(access: AccessContext, target: IndentTarget): boolean {
  return access.canOn(ENQUIRY_VIEW, target) || access.canOn(ENQUIRY_MANAGE, target);
}

export interface EnquiryFlags {
  canEdit: boolean;
  canClose: boolean;
  canCancel: boolean;
}

export function enquiryFlagsFor(
  access: AccessContext,
  enquiry: { companyId: string; projectId: string; siteId: string; status: EnquiryStatus },
): EnquiryFlags {
  const manage = access.canOn(ENQUIRY_MANAGE, enquiryTargetOf(enquiry));

  return {
    canEdit: manage && EDITABLE_ENQUIRY_STATUSES.includes(enquiry.status),
    canClose: manage && enquiry.status === 'SENT',
    canCancel: manage && CANCELLABLE_ENQUIRY_STATUSES.includes(enquiry.status),
  };
}

/** What the API knows about an indent line when it is put on an enquiry. */
export interface IndentLineForEnquiry {
  siteId: string;
  indentApproved: boolean;
  /** Quantity string with 3 decimals, or null if the indent was never approved. */
  approvedQty: string | null;
  itemCode: string;
  /** Item approved and active (OQ-27). */
  itemUsable: boolean;
  decimalPlaces: number;
}

export interface EnquiryLineProblem {
  code: 'INVALID_INDENT_LINE' | 'INVALID_QUANTITY';
  message: string;
}

/**
 * One enquiry line: an approved indent line of the enquiry's site with approved qty > 0, item still
 * usable, quantity within the unit's decimals and not above the approved qty (OQ-47).
 * Returns null when the line is acceptable.
 */
export function enquiryLineProblem(
  lineNo: number,
  quantity: string,
  siteId: string,
  row: IndentLineForEnquiry | undefined,
): EnquiryLineProblem | null {
  if (
    row === undefined ||
    row.siteId !== siteId ||
    !row.indentApproved ||
    row.approvedQty === null ||
    isZeroQuantity(row.approvedQty)
  ) {
    return {
      code: 'INVALID_INDENT_LINE',
      message: `Line ${lineNo}: choose a line of an approved indent of this site.`,
    };
  }

  if (!row.itemUsable) {
    return {
      code: 'INVALID_INDENT_LINE',
      message: `Line ${lineNo}: item ${row.itemCode} is no longer approved or active.`,
    };
  }

  if (!fitsUnit(quantity, row.decimalPlaces)) {
    return {
      code: 'INVALID_QUANTITY',
      message: `Line ${lineNo}: the unit allows ${row.decimalPlaces} decimal place(s).`,
    };
  }

  if (compareQuantity(quantity, row.approvedQty) > 0) {
    return {
      code: 'INVALID_QUANTITY',
      message: `Line ${lineNo}: the quantity is more than the approved indent quantity.`,
    };
  }

  return null;
}
