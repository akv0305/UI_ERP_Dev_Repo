import type { ComparisonStatus, EnquiryStatus, Permission } from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { indentTargetOf, type IndentTarget } from '../indents/indent-rules';

export const COMPARISON_VIEW: Permission = 'purchase.comparisons.view';
export const COMPARISON_MANAGE: Permission = 'purchase.comparisons.manage';

/** Checked against the comparison's site (copied from the enquiry). */
export function comparisonTargetOf(comparison: {
  companyId: string;
  projectId: string;
  siteId: string;
}): IndentTarget {
  return indentTargetOf(comparison);
}

export function canSeeComparison(access: AccessContext, target: IndentTarget): boolean {
  return access.canOn(COMPARISON_VIEW, target) || access.canOn(COMPARISON_MANAGE, target);
}

export interface ComparisonFlags {
  canEdit: boolean;
  canFinalise: boolean;
  canCancel: boolean;
}

/** Edit and finalise need a Draft on a Sent enquiry; cancel needs only a Draft (PD-050). */
export function comparisonFlagsFor(
  access: AccessContext,
  comparison: {
    companyId: string;
    projectId: string;
    siteId: string;
    status: ComparisonStatus;
    enquiry: { status: EnquiryStatus };
  },
): ComparisonFlags {
  const manage = access.canOn(COMPARISON_MANAGE, comparisonTargetOf(comparison));
  const draft = comparison.status === 'DRAFT';
  const sent = comparison.enquiry.status === 'SENT';

  return {
    canEdit: manage && draft && sent,
    canFinalise: manage && draft && sent,
    canCancel: manage && draft,
  };
}
