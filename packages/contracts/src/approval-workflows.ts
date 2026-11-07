import { z } from 'zod';
import { IndentActorSummary, IndentScopeSummary } from './indents';
import { QUOTATION_AMOUNT_PATTERN } from './quotations';
import { OptionalText, optional } from './validators';

/** Documents that go through an approval workflow (PD-054). Purchase orders first. */
export const APPROVAL_DOCUMENT_TYPES = ['PURCHASE_ORDER'] as const;
export const ApprovalDocumentType = z.enum(APPROVAL_DOCUMENT_TYPES);
export type ApprovalDocumentType = z.infer<typeof ApprovalDocumentType>;

/** WAITING = later level; PENDING = with the approver; ON_HOLD = no active holder (OQ-99); CLOSED = not needed any more. */
export const APPROVAL_STEP_STATUSES = [
  'WAITING',
  'PENDING',
  'ON_HOLD',
  'APPROVED',
  'REJECTED',
  'CLOSED',
] as const;
export const ApprovalStepStatus = z.enum(APPROVAL_STEP_STATUSES);
export type ApprovalStepStatus = z.infer<typeof ApprovalStepStatus>;

/** SAME_APPROVER = covered by the same person's approval (OQ-94 c, OQ-100 b, OQ-101, OQ-102); MAKER_SUBMIT = OQ-98 b. */
export const APPROVAL_DECISIONS = [
  'APPROVED',
  'SAME_APPROVER',
  'MAKER_SUBMIT',
  'REJECTED',
] as const;
export const ApprovalDecision = z.enum(APPROVAL_DECISIONS);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

/** Which PO value the route compares with the level amounts (OQ-109). NET_AMOUNT = lines after discount, excl. GST and charges. */
export const APPROVAL_AMOUNT_BASES = ['NET_AMOUNT', 'GRAND_TOTAL'] as const;
export const ApprovalAmountBasis = z.enum(APPROVAL_AMOUNT_BASES);
export type ApprovalAmountBasis = z.infer<typeof ApprovalAmountBasis>;

export const APPROVAL_WORKFLOW_ERROR_CODES = [
  'INVALID_ROLE',
  'INVALID_COMPANY',
  'INVALID_LEVELS',
  'WORKFLOW_CHANGED',
] as const;
export type ApprovalWorkflowErrorCode = (typeof APPROVAL_WORKFLOW_ERROR_CODES)[number];

export const MAX_APPROVAL_LEVELS = 10;

const Amount = z.coerce.string().trim().regex(QUOTATION_AMOUNT_PATTERN);

function splitAmount(value: string): [string, string] {
  const [whole = '0', fraction = ''] = value.split('.');
  return [whole.replace(/^0+(?=\d)/, ''), fraction.padEnd(2, '0')];
}

/** Compares two amount strings (up to 2 decimals) without floating point. */
export function compareAmounts(a: string, b: string): number {
  const [aWhole, aFraction] = splitAmount(a);
  const [bWhole, bFraction] = splitAmount(b);

  if (aWhole.length !== bWhole.length) {
    return aWhole.length - bWhole.length;
  }

  if (aWhole !== bWhole) {
    return aWhole < bWhole ? -1 : 1;
  }

  if (aFraction !== bFraction) {
    return aFraction < bFraction ? -1 : 1;
  }

  return 0;
}

// ---------- Requests ----------

/** A level applies when the document value is above minAmount (PD-054). */
export const ApprovalWorkflowLevelInput = z.object({
  roleId: z.uuid(),
  minAmount: Amount,
  makerCountsAsApproved: z.boolean(),
});

export type ApprovalWorkflowLevelInput = z.infer<typeof ApprovalWorkflowLevelInput>;

/** Saving always creates a new version; POs already submitted keep their route (OQ-96). */
export const SaveApprovalWorkflowRequest = z
  .object({
    documentType: ApprovalDocumentType,
    /** null = all companies; a company id = override for that company (CQ-130). */
    companyId: z.uuid().nullable(),
    remarks: OptionalText(300),
    /** One setting per version (OQ-109); old versions keep theirs. */
    amountBasis: ApprovalAmountBasis.default('NET_AMOUNT'),
    levels: z.array(ApprovalWorkflowLevelInput).min(1).max(MAX_APPROVAL_LEVELS),
  })
  .superRefine((value, ctx) => {
    const seenRoles = new Set<string>();
    let previous: string | null = null;

    value.levels.forEach((level, index) => {
      if (index === 0 && compareAmounts(level.minAmount, '0') !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['levels', index, 'minAmount'],
          message: 'Level 1 always applies (amount 0)',
        });
      }

      if (previous !== null && compareAmounts(level.minAmount, previous) < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['levels', index, 'minAmount'],
          message: 'Amount is lower than the previous level',
        });
      }

      if (index > 0 && level.makerCountsAsApproved) {
        ctx.addIssue({
          code: 'custom',
          path: ['levels', index, 'makerCountsAsApproved'],
          message: 'Only level 1',
        });
      }

      if (seenRoles.has(level.roleId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['levels', index, 'roleId'],
          message: 'Role repeated',
        });
      }

      seenRoles.add(level.roleId);
      previous = level.minAmount;
    });
  });

export type SaveApprovalWorkflowRequest = z.infer<typeof SaveApprovalWorkflowRequest>;

// ---------- Responses ----------

export const ApprovalRoleSummary = z.object({ id: z.uuid(), code: z.string(), name: z.string() });
export type ApprovalRoleSummary = z.infer<typeof ApprovalRoleSummary>;

export const ApprovalWorkflowLevelResponse = z.object({
  levelNo: z.number().int(),
  role: ApprovalRoleSummary,
  minAmount: z.string(),
  makerCountsAsApproved: z.boolean(),
});

export type ApprovalWorkflowLevelResponse = z.infer<typeof ApprovalWorkflowLevelResponse>;

export const ApprovalWorkflowResponse = z.object({
  id: z.uuid(),
  documentType: ApprovalDocumentType,
  /** null = applies to all companies. */
  company: IndentScopeSummary.nullable(),
  version: z.number().int(),
  isCurrent: z.boolean(),
  amountBasis: ApprovalAmountBasis,
  remarks: z.string().nullable(),
  /** The version applies to documents submitted from this time (OQ-96). */
  createdAt: z.string(),
  createdBy: IndentActorSummary,
  levels: z.array(ApprovalWorkflowLevelResponse),
});

export type ApprovalWorkflowResponse = z.infer<typeof ApprovalWorkflowResponse>;

export const ApprovalWorkflowListResponse = z.object({
  items: z.array(ApprovalWorkflowResponse),
});

export type ApprovalWorkflowListResponse = z.infer<typeof ApprovalWorkflowListResponse>;
/** Pick lists for the Approval matrix form: active roles except ADMINISTRATOR (OQ-106), active companies. */
export const ApprovalWorkflowFormOptionsResponse = z.object({
  roles: z.array(ApprovalRoleSummary),
  companies: z.array(IndentScopeSummary),
});

export type ApprovalWorkflowFormOptionsResponse = z.infer<
  typeof ApprovalWorkflowFormOptionsResponse
>;

// ---------- Purchase order approval (G-12 batch 2b) ----------

export const PURCHASE_ORDER_APPROVAL_ERROR_CODES = [
  'NO_APPROVAL_WORKFLOW',
  'NO_APPROVER',
  'APPROVER_REQUIRED',
  'INVALID_APPROVER',
  'NOT_YOUR_STEP',
] as const;
export type PurchaseOrderApprovalErrorCode = (typeof PURCHASE_ORDER_APPROVAL_ERROR_CODES)[number];

/** A missing body counts as {}. */
const bodyOrEmpty = (value: unknown): unknown => value ?? {};

/** nextApproverId is needed only when the next level has several holders (PD-054). */
export const SubmitPurchaseOrderRequest = z.preprocess(
  bodyOrEmpty,
  z.object({ nextApproverId: optional(z.uuid()) }),
);
export type SubmitPurchaseOrderRequest = z.infer<typeof SubmitPurchaseOrderRequest>;

export const ApprovePurchaseOrderRequest = z.preprocess(
  bodyOrEmpty,
  z.object({ remarks: OptionalText(500), nextApproverId: optional(z.uuid()) }),
);
export type ApprovePurchaseOrderRequest = z.infer<typeof ApprovePurchaseOrderRequest>;

export const RejectPurchaseOrderRequest = z.object({ remarks: z.string().trim().min(1).max(500) });
export type RejectPurchaseOrderRequest = z.infer<typeof RejectPurchaseOrderRequest>;

export const ApprovalRouteStepResponse = z.object({
  levelNo: z.number().int(),
  role: ApprovalRoleSummary,
  minAmount: z.string(),
  status: ApprovalStepStatus,
  approver: IndentActorSummary.nullable(),
  decision: ApprovalDecision.nullable(),
  decidedAt: z.string().nullable(),
  remarks: z.string().nullable(),
});
export type ApprovalRouteStepResponse = z.infer<typeof ApprovalRouteStepResponse>;

export const ApprovalRouteNextLevel = z.object({
  levelNo: z.number().int(),
  role: ApprovalRoleSummary,
  /** Who may be chosen; the maker is never one. One candidate = assigned automatically. */
  candidates: z.array(IndentActorSummary),
});
export type ApprovalRouteNextLevel = z.infer<typeof ApprovalRouteNextLevel>;

export const ApprovalRouteResponse = z.object({
  /** True for Draft / Rejected: the levels Submit would create now. */
  preview: z.boolean(),
  workflow: z
    .object({ id: z.uuid(), version: z.number().int(), amountBasis: ApprovalAmountBasis })
    .nullable(),
  /** PO value compared with the level amounts (OQ-109). */
  amount: z.string().nullable(),
  cycleNo: z.number().int(),
  steps: z.array(ApprovalRouteStepResponse),
  /** Level that Submit (or the current approver's Approve) will assign next. */
  next: ApprovalRouteNextLevel.nullable(),
  /** Why Submit / Approve cannot go ahead now (no matrix, nobody holds a role). */
  problem: z.string().nullable(),
  /** The viewer is the current approver and may approve or reject. */
  canDecide: z.boolean(),
});
export type ApprovalRouteResponse = z.infer<typeof ApprovalRouteResponse>;
