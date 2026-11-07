import { Injectable } from '@nestjs/common';
import type { NotificationKind, Prisma } from '@prisma/client';
import type {
  ApprovalAmountBasis,
  ApprovalRouteNextLevel,
  ApprovalRouteResponse,
  ApprovalRouteStepResponse,
} from '@uie/contracts';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  advance,
  applicableLevels,
  candidatesFor,
  noApproverProblem,
  planSubmit,
  routeAmount,
  type AdvanceResult,
  type HoldersByLevel,
  type RouteLevel,
  type StepChange,
} from './approval-route';
import {
  NO_APPROVAL_WORKFLOW_MESSAGE,
  noApprovalWorkflow,
  notYourStep,
  routeError,
} from './purchase-order-approval-errors';

type Tx = Prisma.TransactionClient;

/** What the approval rules read from a purchase order (PurchaseOrderWithDetails fits). */
export interface ApprovalSubject {
  id: string;
  companyId: string;
  projectId: string;
  project: { code: string };
  status: string;
  subtotal: { toFixed(digits: number): string };
  grandTotal: { toFixed(digits: number): string };
  approvalCycle: number;
  approvalWorkflowId: string | null;
  submittedById: string | null;
}

export interface SubmitPlan {
  workflowId: string;
  cycleNo: number;
  levels: RouteLevel[];
  changes: StepChange[];
  finished: boolean;
}

export interface DecisionPlan {
  stepId: string;
  cycleNo: number;
  changes: StepChange[];
  finished: boolean;
}

interface LoadedWorkflow {
  id: string;
  version: number;
  amountBasis: ApprovalAmountBasis;
  levels: RouteLevel[];
}

const stepInclude = {
  role: { select: { id: true, code: true, name: true } },
  approver: { select: { id: true, displayName: true } },
} satisfies Prisma.ApprovalStepInclude;

type StepRow = Prisma.ApprovalStepGetPayload<{ include: typeof stepInclude }>;

const OPEN_STEP_STATUSES = ['WAITING', 'PENDING', 'ON_HOLD'] as const;

function totalsOf(po: ApprovalSubject): { subtotal: string; grandTotal: string } {
  return { subtotal: po.subtotal.toFixed(2), grandTotal: po.grandTotal.toFixed(2) };
}

function unwrap(result: AdvanceResult): { changes: StepChange[]; finished: boolean } {
  if (!result.ok) {
    throw routeError(result.problem.code, result.problem.message);
  }

  return { changes: result.changes, finished: result.finished };
}

function levelOfStep(step: StepRow): RouteLevel {
  return {
    levelNo: step.levelNo,
    roleId: step.roleId,
    roleCode: step.role.code,
    roleName: step.role.name,
    minAmount: step.minAmount.toFixed(2),
    makerCountsAsApproved: false,
  };
}

function nextLevelOf(
  level: RouteLevel,
  holders: HoldersByLevel,
  makerId: string,
): ApprovalRouteNextLevel {
  return {
    levelNo: level.levelNo,
    role: { id: level.roleId, code: level.roleCode, name: level.roleName },
    candidates: candidatesFor(level, holders, makerId),
  };
}

function stepValues(change: StepChange, actorId: string, now: Date) {
  return change.status === 'PENDING'
    ? {
        status: 'PENDING' as const,
        approverId: change.approverId,
        assignedAt: now,
        assignedById: actorId,
      }
    : {
        status: 'APPROVED' as const,
        approverId: change.approverId,
        decision: change.decision ?? ('APPROVED' as const),
        decidedAt: now,
        decidedById: change.approverId,
      };
}

function toStepResponse(step: StepRow): ApprovalRouteStepResponse {
  return {
    levelNo: step.levelNo,
    role: step.role,
    minAmount: step.minAmount.toFixed(2),
    status: step.status,
    approver: step.approver,
    decision: step.decision,
    decidedAt: step.decidedAt?.toISOString() ?? null,
    remarks: step.remarks,
  };
}

function previewStep(level: RouteLevel): ApprovalRouteStepResponse {
  return {
    levelNo: level.levelNo,
    role: { id: level.roleId, code: level.roleCode, name: level.roleName },
    minAmount: level.minAmount,
    status: 'WAITING',
    approver: null,
    decision: null,
    decidedAt: null,
    remarks: null,
  };
}

/**
 * PO approval route (PD-054): planned outside the transaction (holder lookups), written inside the
 * PO's own transaction through PurchaseOrdersService.transition.
 */
@Injectable()
export class PurchaseOrderApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Current version (company override, else all companies) fixes the route (OQ-105, OQ-108). */
  async planSubmit(
    po: ApprovalSubject,
    makerId: string,
    chosenApproverId: string | null,
  ): Promise<SubmitPlan> {
    const workflow = await this.currentWorkflow(po.companyId);

    if (workflow === null) {
      throw noApprovalWorkflow();
    }

    const levels = applicableLevels(
      workflow.levels,
      routeAmount(workflow.amountBasis, totalsOf(po)),
    );
    const holders = await this.holdersFor(levels, po.projectId);
    const result = unwrap(
      planSubmit({ levels, holders, makerId, chosenApproverId, projectCode: po.project.code }),
    );

    return { workflowId: workflow.id, cycleNo: po.approvalCycle + 1, levels, ...result };
  }

  async writeSubmit(
    tx: Tx,
    purchaseOrderId: string,
    plan: SubmitPlan,
    actorId: string,
  ): Promise<void> {
    const now = new Date();

    for (const level of plan.levels) {
      const change = plan.changes.find((row) => row.levelNo === level.levelNo);
      const step = await tx.approvalStep.create({
        data: {
          purchaseOrderId,
          cycleNo: plan.cycleNo,
          levelNo: level.levelNo,
          roleId: level.roleId,
          minAmount: level.minAmount,
          ...(change === undefined ? {} : stepValues(change, actorId, now)),
        },
        select: { id: true },
      });

      if (change?.status === 'PENDING') {
        await this.notify(
          tx,
          change.approverId,
          'APPROVAL_PENDING',
          purchaseOrderId,
          step.id,
          actorId,
        );
      }
    }
  }

  async planApprove(
    po: ApprovalSubject,
    actorId: string,
    chosenApproverId: string | null,
  ): Promise<DecisionPlan> {
    const { step, steps } = await this.requireMyStep(po, actorId);
    const remaining = steps.filter((row) => row.levelNo > step.levelNo).map(levelOfStep);
    const holders = await this.holdersFor(remaining, po.projectId);
    const result = unwrap(
      advance({
        levels: remaining,
        holders,
        makerId: po.submittedById ?? '',
        previousApproverId: actorId,
        chosenApproverId,
        projectCode: po.project.code,
      }),
    );

    return { stepId: step.id, cycleNo: po.approvalCycle, ...result };
  }

  async writeApprove(
    tx: Tx,
    po: ApprovalSubject,
    plan: DecisionPlan,
    actorId: string,
    remarks: string | null,
  ): Promise<void> {
    const now = new Date();

    // Close the current step first: only one step per PO may be pending (approval_steps_one_open_per_po).
    await tx.approvalStep.update({
      where: { id: plan.stepId },
      data: {
        status: 'APPROVED',
        decision: 'APPROVED',
        decidedAt: now,
        decidedById: actorId,
        remarks,
      },
    });

    for (const change of plan.changes) {
      const step = await tx.approvalStep.update({
        where: {
          purchaseOrderId_cycleNo_levelNo: {
            purchaseOrderId: po.id,
            cycleNo: plan.cycleNo,
            levelNo: change.levelNo,
          },
        },
        data: stepValues(change, actorId, now),
        select: { id: true },
      });

      if (change.status === 'PENDING') {
        await this.notify(tx, change.approverId, 'APPROVAL_PENDING', po.id, step.id, actorId);
      }
    }

    if (plan.finished) {
      await this.notify(tx, po.submittedById, 'PURCHASE_ORDER_APPROVED', po.id, null, actorId);
    }
  }

  async planReject(po: ApprovalSubject, actorId: string): Promise<DecisionPlan> {
    const { step } = await this.requireMyStep(po, actorId);

    return { stepId: step.id, cycleNo: po.approvalCycle, changes: [], finished: false };
  }

  /** Back to the maker (OQ-95); later levels are not needed any more. */
  async writeReject(
    tx: Tx,
    po: ApprovalSubject,
    plan: DecisionPlan,
    actorId: string,
    remarks: string,
  ): Promise<void> {
    await tx.approvalStep.update({
      where: { id: plan.stepId },
      data: {
        status: 'REJECTED',
        decision: 'REJECTED',
        decidedAt: new Date(),
        decidedById: actorId,
        remarks,
      },
    });
    await tx.approvalStep.updateMany({
      where: { purchaseOrderId: po.id, cycleNo: plan.cycleNo, status: 'WAITING' },
      data: { status: 'CLOSED' },
    });
    await this.notify(tx, po.submittedById, 'PURCHASE_ORDER_REJECTED', po.id, plan.stepId, actorId);
  }

  /** On Cancel: steps still open in the current cycle are closed (OQ-112). */
  async closeOpenSteps(tx: Tx, po: ApprovalSubject): Promise<void> {
    if (po.approvalCycle === 0) {
      return;
    }

    await tx.approvalStep.updateMany({
      where: {
        purchaseOrderId: po.id,
        cycleNo: po.approvalCycle,
        status: { in: [...OPEN_STEP_STATUSES] },
      },
      data: { status: 'CLOSED' },
    });
  }

  /** Assigned or past approver of the PO, in any cycle (OQ-103). */
  async isOnRoute(purchaseOrderId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.approvalStep.count({
      where: { purchaseOrderId, approverId: userId },
    });

    return count > 0;
  }

  async route(po: ApprovalSubject, viewerId: string): Promise<ApprovalRouteResponse> {
    if (po.status === 'DRAFT' || po.status === 'REJECTED') {
      return this.preview(po, viewerId);
    }

    const [steps, workflow] = await Promise.all([
      po.approvalCycle === 0 ? Promise.resolve<StepRow[]>([]) : this.loadCycle(po),
      po.approvalWorkflowId === null
        ? Promise.resolve(null)
        : this.prisma.approvalWorkflow.findUnique({
            where: { id: po.approvalWorkflowId },
            select: { id: true, version: true, amountBasis: true },
          }),
    ]);
    const current = steps.find((row) => row.status === 'PENDING');
    const canDecide =
      po.status === 'SUBMITTED' && current !== undefined && current.approverId === viewerId;
    let next: ApprovalRouteNextLevel | null = null;
    let problem: string | null = null;

    if (canDecide && current !== undefined) {
      const makerId = po.submittedById ?? '';
      const remaining = steps.filter((row) => row.levelNo > current.levelNo).map(levelOfStep);
      const holders = await this.holdersFor(remaining, po.projectId);
      // The first later level the viewer does not hold themselves (those are recorded as same approver).
      const target = remaining.find(
        (level) => !candidatesFor(level, holders, makerId).some((holder) => holder.id === viewerId),
      );

      if (target !== undefined) {
        next = nextLevelOf(target, holders, makerId);

        if (next.candidates.length === 0) {
          problem = noApproverProblem(target, po.project.code).message;
        }
      }
    }

    return {
      preview: false,
      workflow,
      amount: workflow === null ? null : routeAmount(workflow.amountBasis, totalsOf(po)),
      cycleNo: po.approvalCycle,
      steps: steps.map(toStepResponse),
      next,
      problem,
      canDecide,
    };
  }

  /** Draft / Rejected: what Submit by the viewer would create now. */
  private async preview(po: ApprovalSubject, viewerId: string): Promise<ApprovalRouteResponse> {
    const workflow = await this.currentWorkflow(po.companyId);

    if (workflow === null) {
      return {
        preview: true,
        workflow: null,
        amount: null,
        cycleNo: po.approvalCycle,
        steps: [],
        next: null,
        problem: NO_APPROVAL_WORKFLOW_MESSAGE,
        canDecide: false,
      };
    }

    const amount = routeAmount(workflow.amountBasis, totalsOf(po));
    const levels = applicableLevels(workflow.levels, amount);
    const holders = await this.holdersFor(levels, po.projectId);
    const result = planSubmit({
      levels,
      holders,
      makerId: viewerId,
      chosenApproverId: null,
      projectCode: po.project.code,
    });
    let nextLevelNo: number | null = null;
    let problem: string | null = null;

    if (result.ok) {
      nextLevelNo = result.changes.find((row) => row.status === 'PENDING')?.levelNo ?? null;
    } else if (result.problem.code === 'APPROVER_REQUIRED') {
      nextLevelNo = result.problem.levelNo;
    } else {
      problem = result.problem.message;
    }

    const nextLevel = levels.find((row) => row.levelNo === nextLevelNo);

    return {
      preview: true,
      workflow: { id: workflow.id, version: workflow.version, amountBasis: workflow.amountBasis },
      amount,
      cycleNo: po.approvalCycle,
      steps: levels.map(previewStep),
      next: nextLevel === undefined ? null : nextLevelOf(nextLevel, holders, viewerId),
      problem,
      canDecide: false,
    };
  }

  private async currentWorkflow(companyId: string): Promise<LoadedWorkflow | null> {
    const rows = await this.prisma.approvalWorkflow.findMany({
      where: {
        documentType: 'PURCHASE_ORDER',
        isCurrent: true,
        OR: [{ companyId }, { companyId: null }],
      },
      include: {
        levels: {
          orderBy: { levelNo: 'asc' },
          include: { role: { select: { code: true, name: true } } },
        },
      },
    });
    // A company override wins over the all-companies version (CQ-130).
    const row =
      rows.find((item) => item.companyId === companyId) ??
      rows.find((item) => item.companyId === null);

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      version: row.version,
      amountBasis: row.amountBasis,
      levels: row.levels.map((item) => ({
        levelNo: item.levelNo,
        roleId: item.roleId,
        roleCode: item.role.code,
        roleName: item.role.name,
        minAmount: item.minAmount.toFixed(2),
        makerCountsAsApproved: item.makerCountsAsApproved,
      })),
    };
  }

  /** Holders on GLOBAL / the project's company / the project, never site-only (OQ-103, OQ-110). */
  private async holdersFor(
    levels: readonly RouteLevel[],
    projectId: string,
  ): Promise<HoldersByLevel> {
    const lists = await Promise.all(
      levels.map((level) => this.access.findUsersWithRoleCovering(level.roleCode, projectId)),
    );

    return new Map(
      levels.map((level, index) => [
        level.levelNo,
        (lists[index] ?? []).map((user) => ({ id: user.id, displayName: user.displayName })),
      ]),
    );
  }

  private loadCycle(po: ApprovalSubject): Promise<StepRow[]> {
    return this.prisma.approvalStep.findMany({
      where: { purchaseOrderId: po.id, cycleNo: po.approvalCycle },
      orderBy: { levelNo: 'asc' },
      include: stepInclude,
    });
  }

  private async requireMyStep(
    po: ApprovalSubject,
    actorId: string,
  ): Promise<{ step: StepRow; steps: StepRow[] }> {
    const steps = await this.loadCycle(po);
    const step = steps.find((row) => row.status === 'PENDING');

    if (po.status !== 'SUBMITTED' || step === undefined || step.approverId !== actorId) {
      throw notYourStep();
    }

    return { step, steps };
  }

  private async notify(
    tx: Tx,
    userId: string | null,
    kind: NotificationKind,
    purchaseOrderId: string,
    approvalStepId: string | null,
    actorId: string,
  ): Promise<void> {
    if (userId === null || userId === actorId) {
      return;
    }

    await tx.notification.create({ data: { userId, kind, purchaseOrderId, approvalStepId } });
  }
}
