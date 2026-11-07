import { compareAmounts, type ApprovalAmountBasis } from '@uie/contracts';

/** One route level, copied from the workflow version or read back from a saved step. */
export interface RouteLevel {
  levelNo: number;
  roleId: string;
  roleCode: string;
  roleName: string;
  /** Always with 2 decimals. */
  minAmount: string;
  makerCountsAsApproved: boolean;
}

export interface Holder {
  id: string;
  displayName: string;
}

/** Active holders of each level's role on the PO's project, by level number. */
export type HoldersByLevel = ReadonlyMap<number, readonly Holder[]>;

export interface StepChange {
  levelNo: number;
  status: 'APPROVED' | 'PENDING';
  /** Set on APPROVED changes made without a separate decision. */
  decision: 'SAME_APPROVER' | 'MAKER_SUBMIT' | null;
  approverId: string;
}

export type RouteProblemCode = 'NO_APPROVER' | 'APPROVER_REQUIRED' | 'INVALID_APPROVER';

export interface RouteProblem {
  code: RouteProblemCode;
  message: string;
  levelNo: number;
}

export type AdvanceResult =
  { ok: true; changes: StepChange[]; finished: boolean } | { ok: false; problem: RouteProblem };

export interface AdvanceInput {
  /** Levels still to resolve, in order. */
  levels: readonly RouteLevel[];
  holders: HoldersByLevel;
  /** Submitter of the PO: never an approver above level 1 (PD-054). */
  makerId: string;
  /**
   * Everyone who already approved in this cycle, including the current approver: covers any later
   * level whose role they hold, adjacent or not (OQ-94 c, OQ-100 b, OQ-113).
   */
  approvedByIds: readonly string[];
  chosenApproverId: string | null;
  projectCode: string;
}

/** NET_AMOUNT = lines after discount, excl. GST and charges (OQ-109). */
export function routeAmount(
  basis: ApprovalAmountBasis,
  totals: { subtotal: string; grandTotal: string },
): string {
  return basis === 'GRAND_TOTAL' ? totals.grandTotal : totals.subtotal;
}

/** Level 1 always; a later level only when the amount is above its minimum (PD-008, PD-054). */
export function applicableLevels(levels: readonly RouteLevel[], amount: string): RouteLevel[] {
  return [...levels]
    .sort((a, b) => a.levelNo - b.levelNo)
    .filter((level, index) => index === 0 || compareAmounts(amount, level.minAmount) > 0);
}

export function candidatesFor(
  level: RouteLevel,
  holders: HoldersByLevel,
  makerId: string,
): Holder[] {
  return (holders.get(level.levelNo) ?? []).filter((holder) => holder.id !== makerId);
}

export function noApproverProblem(level: RouteLevel, projectCode: string): RouteProblem {
  return {
    code: 'NO_APPROVER',
    levelNo: level.levelNo,
    message: `No active user holds the ${level.roleName} role for project ${projectCode}. Ask the administrator to assign one.`,
  };
}

function pick(
  level: RouteLevel,
  candidates: readonly Holder[],
  chosenApproverId: string | null,
  projectCode: string,
): Holder | RouteProblem {
  const [only] = candidates;

  if (only === undefined) {
    return noApproverProblem(level, projectCode);
  }

  if (chosenApproverId === null) {
    return candidates.length === 1
      ? only
      : {
          code: 'APPROVER_REQUIRED',
          levelNo: level.levelNo,
          message: `Choose who approves at level ${level.levelNo} (${level.roleName}).`,
        };
  }

  return (
    candidates.find((holder) => holder.id === chosenApproverId) ?? {
      code: 'INVALID_APPROVER',
      levelNo: level.levelNo,
      message: `The chosen user cannot approve at level ${level.levelNo} (${level.roleName}).`,
    }
  );
}

/** Moves along the levels: levels held by an earlier approver are recorded, the first other level is assigned. */
export function advance(input: AdvanceInput): AdvanceResult {
  const changes: StepChange[] = [];
  const approved = new Set(input.approvedByIds);

  for (const level of input.levels) {
    const candidates = candidatesFor(level, input.holders, input.makerId);
    const same = candidates.find((holder) => approved.has(holder.id));

    if (same !== undefined) {
      changes.push({
        levelNo: level.levelNo,
        status: 'APPROVED',
        decision: 'SAME_APPROVER',
        approverId: same.id,
      });
      continue;
    }

    const picked = pick(level, candidates, input.chosenApproverId, input.projectCode);

    if ('code' in picked) {
      return { ok: false, problem: picked };
    }

    changes.push({
      levelNo: level.levelNo,
      status: 'PENDING',
      decision: null,
      approverId: picked.id,
    });

    return { ok: true, changes, finished: false };
  }

  return { ok: true, changes, finished: true };
}

/**
 * Route at Submit. A maker holding the level-1 role counts as level 1 when the level allows it
 * (OQ-98 b). Every level still to approve needs a holder other than the maker, else Submit is
 * refused (OQ-104).
 */
export function planSubmit(input: Omit<AdvanceInput, 'approvedByIds'>): AdvanceResult {
  const [first, ...rest] = input.levels;

  if (first === undefined) {
    throw new Error('Approval workflow has no levels');
  }

  const makerApproves =
    first.makerCountsAsApproved &&
    (input.holders.get(first.levelNo) ?? []).some((holder) => holder.id === input.makerId);
  const toResolve = makerApproves ? rest : [...input.levels];

  for (const level of toResolve) {
    if (candidatesFor(level, input.holders, input.makerId).length === 0) {
      return { ok: false, problem: noApproverProblem(level, input.projectCode) };
    }
  }

  const result = advance({ ...input, levels: toResolve, approvedByIds: [] });

  if (!result.ok || !makerApproves) {
    return result;
  }

  return {
    ok: true,
    finished: result.finished,
    changes: [
      {
        levelNo: first.levelNo,
        status: 'APPROVED',
        decision: 'MAKER_SUBMIT',
        approverId: input.makerId,
      },
      ...result.changes,
    ],
  };
}
