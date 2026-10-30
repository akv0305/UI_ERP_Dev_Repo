import type { EnquiryStatus, Permission, QuotationStatus } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { indentTargetOf, type IndentTarget } from '../indents/indent-rules';

export const QUOTATION_VIEW: Permission = 'purchase.quotations.view';
export const QUOTATION_MANAGE: Permission = 'purchase.quotations.manage';

/** Only a draft may be edited or submitted. */
export const EDITABLE_QUOTATION_STATUSES: readonly QuotationStatus[] = ['DRAFT'];

/** Draft or submitted quotations may be cancelled (PD-049). */
export const CANCELLABLE_QUOTATION_STATUSES: readonly QuotationStatus[] = ['DRAFT', 'SUBMITTED'];

/** At most one of each per enquiry + vendor (partial unique indexes, OQ-54). */
export const OPEN_QUOTATION_STATUSES: readonly QuotationStatus[] = ['DRAFT', 'SUBMITTED'];

/** Checked against the quotation's site (copied from the enquiry). */
export function quotationTargetOf(quotation: {
  companyId: string;
  projectId: string;
  siteId: string;
}): IndentTarget {
  return indentTargetOf(quotation);
}

/** Visible with view or manage over the quotation's site. */
export function canSeeQuotation(access: AccessContext, target: IndentTarget): boolean {
  return access.canOn(QUOTATION_VIEW, target) || access.canOn(QUOTATION_MANAGE, target);
}

export interface QuotationFlags {
  canEdit: boolean;
  canRevise: boolean;
  canCancel: boolean;
}

/**
 * hasOpenDraft = a Draft already exists for the same enquiry + vendor.
 * inFinalisedComparison = the quotation was recorded by a finalised comparison, so it can no longer be cancelled.
 */
export function quotationFlagsFor(
  access: AccessContext,
  quotation: {
    companyId: string;
    projectId: string;
    siteId: string;
    status: QuotationStatus;
    enquiry: { status: EnquiryStatus };
  },
  hasOpenDraft: boolean,
  inFinalisedComparison = false,
): QuotationFlags {
  const manage = access.canOn(QUOTATION_MANAGE, quotationTargetOf(quotation));

  return {
    canEdit: manage && EDITABLE_QUOTATION_STATUSES.includes(quotation.status),
    canRevise:
      manage &&
      quotation.status === 'SUBMITTED' &&
      quotation.enquiry.status === 'SENT' &&
      !hasOpenDraft,
    canCancel:
      manage && CANCELLABLE_QUOTATION_STATUSES.includes(quotation.status) && !inFinalisedComparison,
  };
}
