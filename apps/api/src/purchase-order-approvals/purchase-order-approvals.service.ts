import { Injectable } from '@nestjs/common';
import type { NotificationKind, Prisma } from '@prisma/client';
import {
  ADMINISTRATOR_ROLE_CODE,
  type ApprovalAmountBasis,
  type ApprovalRoleSummary,
  type ApprovalRouteAdminActions,
  type ApprovalRouteHigherRole,
  type ApprovalRouteNextLevel,
  type ApprovalRouteResponse,
  type ApprovalRouteStepResponse,
  type ReassignApproverRequest,
  type RouteToHigherRoleRequest,
} from '@uie/contracts';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { invalidPurchaseOrderStatus } from '../purchase-orders/purchase-order-errors';
import {
  advance,
  applicableLevels,
  candidatesFor,
  planSubmit,
  reconcileStep,
  routeAmount,
  type AdvanceResult,
  type Holder,
  type HoldersByLevel,
  type ReconcileAction,
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

/** Administrator change of the open level (OQ-97, OQ-99, OQ-119). */
export interface ReassignPlan {
  stepId: string;
  levelNo: number;
  fromStatus: 'PENDING' | 'ON_HOLD';
  fromApproverId: string | null;
  fromApproverName: string | null;
  approverId: string;
  approverName: string;
  /** Kept as is on Reassign; set by Route to higher level. */
  routedRole: ApprovalRoleSummary | null;
  routeReason: string | null;
  remarks: string;
}

interface LoadedWorkflow {
  id: string;
  version: number;
  amountBasis: ApprovalAmountBasis;
  levels: RouteLevel[];
}

interface PurchaseOrderRef {
  id: string;
  companyId: string;
  submittedById: string | null;
}

const stepInclude = {
  role: { select: { id: true, code: true, name: true } },
  approver: { select: { id: true, displayName: true } },
} satisfies Prisma.ApprovalStepInclude;

type StepRow = Prisma.ApprovalStepGetPayload<{ include: typeof stepInclude }>;

const OPEN_STEP_STATUSES = ['WAITING', 'PENDING', 'ON_HOLD'] as const;
const ROUTE_CHANGED = 'This approval level was changed by someone else. Reload and try again.';
const NO_OPEN_LEVEL = 'This purchase order has no level waiting for an approver.';
const NOT_ON_HOLD = 'Only a level on hold can be routed to a higher role.';

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

/** The role a level is checked against: the routed role once the Administrator routed it (OQ-119). */
function effectiveRoleId(step: { roleId: string; routedRoleId: string | null }): string {
  return step.routedRoleId ?? step.roleId;
}

function stepValues(change: StepChange, actorId: string, now: Date) {
  if (change.status === 'PENDING') {
    return {
      status: 'PENDING' as const,
      approverId: change.approverId,
      assignedAt: now,
      assignedById: actorId,
    };
  }

  if (change.status === 'ON_HOLD') {
    return {
      status: 'ON_HOLD' as const,
      approverId: null,
      assignedAt: null,
      assignedById: null,
    };
  }

  return {
    status: 'APPROVED' as const,
    approverId: change.approverId,
    decision: change.decision ?? ('APPROVED' as const),
    decidedAt: now,
    decidedById: change.approverId,
  };
}

function toStepResponse(
  step: StepRow,
  routedRoles: ReadonlyMap<string, ApprovalRoleSummary>,
): ApprovalRouteStepResponse {
  return {
    levelNo: step.levelNo,
    role: step.role,
    minAmount: step.minAmount.toFixed(2),
    status: step.status,
    approver: step.approver,
    decision: step.decision,
    decidedAt: step.decidedAt?.toISOString() ?? null,
    remarks: step.remarks,
    routedRole: step.routedRoleId === null ? null : (routedRoles.get(step.routedRoleId) ?? null),
    routeReason: step.routeReason,
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
    routedRole: null,
    routeReason: null,
  };
}

/** Approvers already recorded as Approved in the loaded cycle (OQ-100 b). */
function approverIdsOf(steps: readonly StepRow[]): string[] {
  return steps.flatMap((row) =>
    row.status === 'APPROVED' && row.approverId !== null ? [row.approverId] : [],
  );
}

/**
 * Active holders of a role on GLOBAL / the project's company / the project, never site-only: the same
 * rule as AccessService.findUsersWithRoleCovering, but read through `db` so a transaction sees its own
 * role changes (OQ-99, OQ-117).
 */
async function holdersWithin(
  db: Tx,
  roleId: string,
  companyId: string,
  projectId: string,
): Promise<Holder[]> {
  const rows = await db.userRole.findMany({
    where: {
      roleId,
      role: { isActive: true },
      user: { isActive: true },
      OR: [
        { scopeType: 'GLOBAL' },
        { scopeType: 'COMPANY', companyId },
        { scopeType: 'PROJECT', projectId },
      ],
    },
    select: { user: { select: { id: true, displayName: true } } },
    orderBy: { user: { username: 'asc' } },
  });
  const found = new Map<string, Holder>();

  for (const row of rows) {
    found.set(row.user.id, { id: row.user.id, displayName: row.user.displayName });
  }

  return [...found.values()];
}

/** Active users holding the Administrator role (OQ-118). */
async function administratorIds(db: Tx): Promise<string[]> {
  const rows = await db.user.findMany({
    where: {
      isActive: true,
      roles: {
        some: { scopeType: 'GLOBAL', role: { code: ADMINISTRATOR_ROLE_CODE, isActive: true } },
      },
    },
    select: { id: true },
  });

  return rows.map((row) => row.id);
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
    private readonly audit: AuditService,
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
        approvedByIds: [actorId, ...approverIdsOf(steps)],
        chosenApproverId,
        projectCode: po.project.code,
        holdWhenNoApprover: true,
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

    // Close the current step first: only one step per PO may be open (approval_steps_one_open_per_po).
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

      if (change.status === 'ON_HOLD') {
        await this.notifyOnHold(tx, po, step.id, actorId);
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

  /** On Cancel: open steps of the current cycle are closed; the current approver is told (OQ-112). */
  async closeOpenSteps(tx: Tx, po: ApprovalSubject, actorId: string): Promise<void> {
    if (po.approvalCycle === 0) {
      return;
    }

    const pending = await tx.approvalStep.findFirst({
      where: { purchaseOrderId: po.id, cycleNo: po.approvalCycle, status: 'PENDING' },
      select: { id: true, approverId: true },
    });

    await tx.approvalStep.updateMany({
      where: {
        purchaseOrderId: po.id,
        cycleNo: po.approvalCycle,
        status: { in: [...OPEN_STEP_STATUSES] },
      },
      data: { status: 'CLOSED' },
    });

    if (pending !== null) {
      await this.notify(
        tx,
        pending.approverId,
        'PURCHASE_ORDER_CANCELLED',
        po.id,
        pending.id,
        actorId,
      );
    }
  }

  /** Assigned or past approver of the PO, in any cycle (OQ-103). */
  async isOnRoute(purchaseOrderId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.approvalStep.count({
      where: { purchaseOrderId, approverId: userId },
    });

    return count > 0;
  }

  async route(
    po: ApprovalSubject,
    viewerId: string,
    isAdministrator: boolean,
  ): Promise<ApprovalRouteResponse> {
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
    const routedRoles = await this.roleSummaries(steps.map((row) => row.routedRoleId));
    const current = steps.find((row) => row.status === 'PENDING');
    const open = steps.find((row) => row.status === 'PENDING' || row.status === 'ON_HOLD');
    const canDecide =
      po.status === 'SUBMITTED' && current !== undefined && current.approverId === viewerId;
    let next: ApprovalRouteNextLevel | null = null;

    if (canDecide && current !== undefined) {
      const makerId = po.submittedById ?? '';
      const remaining = steps.filter((row) => row.levelNo > current.levelNo).map(levelOfStep);
      const holders = await this.holdersFor(remaining, po.projectId);
      // The first later level not held by the viewer or an earlier approver (those are recorded as same approver, OQ-100 b).
      // No candidates = that level goes On hold on Approve (OQ-117).
      const approved = new Set([viewerId, ...approverIdsOf(steps)]);
      const target = remaining.find(
        (level) =>
          !candidatesFor(level, holders, makerId).some((holder) => approved.has(holder.id)),
      );

      if (target !== undefined) {
        next = nextLevelOf(target, holders, makerId);
      }
    }

    const admin =
      isAdministrator && po.status === 'SUBMITTED' && open !== undefined
        ? await this.adminActions(po, open)
        : null;

    return {
      preview: false,
      workflow,
      amount: workflow === null ? null : routeAmount(workflow.amountBasis, totalsOf(po)),
      cycleNo: po.approvalCycle,
      steps: steps.map((row) => toStepResponse(row, routedRoles)),
      next,
      problem:
        open?.status === 'ON_HOLD'
          ? `Level ${open.levelNo} is on hold: nobody can approve it now. The administrator has been told.`
          : null,
      canDecide,
      admin,
    };
  }

  /** Administrator: another holder of the open level's role (OQ-97, OQ-119). */
  async planReassign(po: ApprovalSubject, request: ReassignApproverRequest): Promise<ReassignPlan> {
    const open = await this.requireOpenStep(po);
    const makerId = po.submittedById ?? '';
    const holders = await holdersWithin(
      this.prisma,
      effectiveRoleId(open),
      po.companyId,
      po.projectId,
    );
    const chosen = holders.find(
      (holder) =>
        holder.id === request.approverId && holder.id !== makerId && holder.id !== open.approverId,
    );

    if (chosen === undefined) {
      throw routeError(
        'INVALID_APPROVER',
        `The chosen user cannot approve at level ${open.levelNo}.`,
      );
    }

    const routedRoles = await this.roleSummaries([open.routedRoleId]);
    const routedRole =
      open.routedRoleId === null ? null : (routedRoles.get(open.routedRoleId) ?? null);

    return {
      stepId: open.id,
      levelNo: open.levelNo,
      fromStatus: open.status === 'ON_HOLD' ? 'ON_HOLD' : 'PENDING',
      fromApproverId: open.approverId,
      fromApproverName: open.approver?.displayName ?? null,
      approverId: chosen.id,
      approverName: chosen.displayName,
      routedRole,
      routeReason: routedRole === null ? null : open.routeReason,
      remarks: request.remarks,
    };
  }

  /** Administrator, On hold level only: a role from a later level of the PO's workflow version (OQ-99, OQ-119). */
  async planRouteHigher(
    po: ApprovalSubject,
    request: RouteToHigherRoleRequest,
  ): Promise<ReassignPlan> {
    const open = await this.requireOpenStep(po);

    if (open.status !== 'ON_HOLD') {
      throw invalidPurchaseOrderStatus(NOT_ON_HOLD);
    }

    const role = (await this.laterWorkflowRoles(po, open.levelNo)).find(
      (row) => row.id === request.roleId,
    );

    if (role === undefined) {
      throw routeError(
        'INVALID_APPROVER',
        'Choose a role from a later level of this purchase order’s approval matrix.',
      );
    }

    const makerId = po.submittedById ?? '';
    const holders = await holdersWithin(this.prisma, role.id, po.companyId, po.projectId);
    const chosen = holders.find(
      (holder) => holder.id === request.approverId && holder.id !== makerId,
    );

    if (chosen === undefined) {
      throw routeError(
        'INVALID_APPROVER',
        `The chosen user does not hold the ${role.name} role for this project.`,
      );
    }

    return {
      stepId: open.id,
      levelNo: open.levelNo,
      fromStatus: 'ON_HOLD',
      fromApproverId: open.approverId,
      fromApproverName: open.approver?.displayName ?? null,
      approverId: chosen.id,
      approverName: chosen.displayName,
      routedRole: role,
      routeReason: request.reason,
      remarks: request.reason,
    };
  }

  /** Writes a Reassign or Route-to-higher plan; refuses if the level changed since it was read. */
  async writeReassign(
    tx: Tx,
    po: ApprovalSubject,
    plan: ReassignPlan,
    actorId: string,
  ): Promise<void> {
    const result = await tx.approvalStep.updateMany({
      where: { id: plan.stepId, status: plan.fromStatus, approverId: plan.fromApproverId },
      data: {
        status: 'PENDING',
        approverId: plan.approverId,
        assignedAt: new Date(),
        assignedById: actorId,
        routedRoleId: plan.routedRole?.id ?? null,
        routeReason: plan.routeReason,
      },
    });

    if (result.count === 0) {
      throw invalidPurchaseOrderStatus(ROUTE_CHANGED);
    }

    await this.notify(tx, plan.approverId, 'APPROVAL_PENDING', po.id, plan.stepId, actorId);
    await this.recordLevelChange(
      tx,
      po,
      actorId,
      { level: plan.levelNo, status: plan.fromStatus, approver: plan.fromApproverName },
      {
        level: plan.levelNo,
        status: 'PENDING',
        approver: plan.approverName,
        routedRole: plan.routedRole?.code ?? null,
        routeReason: plan.routeReason,
        remarks: plan.remarks,
      },
    );
  }

  /**
   * Called inside a user or role save: re-checks open levels of submitted POs against the holders
   * that transaction sees (OQ-99, OQ-117). `userId` limits Pending levels to that approver,
   * `roleId` to that role; On hold levels are always re-checked.
   */
  async reconcileOpenSteps(
    tx: Tx,
    actorId: string,
    scope: { userId?: string; roleId?: string },
  ): Promise<void> {
    const pending: Prisma.ApprovalStepWhereInput = { status: 'PENDING' };

    if (scope.userId !== undefined) {
      pending.approverId = scope.userId;
    }

    if (scope.roleId !== undefined) {
      pending.OR = [{ roleId: scope.roleId }, { routedRoleId: scope.roleId }];
    }

    const steps = await tx.approvalStep.findMany({
      where: { OR: [{ status: 'ON_HOLD' }, pending] },
      orderBy: [{ purchaseOrderId: 'asc' }, { levelNo: 'asc' }],
      include: stepInclude,
    });

    if (steps.length === 0) {
      return;
    }

    const orders = await tx.purchaseOrder.findMany({
      where: {
        id: { in: [...new Set(steps.map((row) => row.purchaseOrderId))] },
        status: 'SUBMITTED',
      },
      select: {
        id: true,
        companyId: true,
        projectId: true,
        approvalCycle: true,
        submittedById: true,
      },
    });
    const orderById = new Map(orders.map((row) => [row.id, row]));

    for (const step of steps) {
      const po = orderById.get(step.purchaseOrderId);

      if (po === undefined || po.approvalCycle !== step.cycleNo) {
        continue;
      }

      const holders = await holdersWithin(tx, effectiveRoleId(step), po.companyId, po.projectId);
      const action = reconcileStep(
        { status: step.status === 'ON_HOLD' ? 'ON_HOLD' : 'PENDING', approverId: step.approverId },
        holders,
        po.submittedById ?? '',
      );

      await this.applyReconcile(tx, po, step, action, holders, actorId);
    }
  }

  private async applyReconcile(
    tx: Tx,
    po: PurchaseOrderRef,
    step: StepRow,
    action: ReconcileAction,
    holders: readonly Holder[],
    actorId: string,
  ): Promise<void> {
    if (action.kind === 'KEEP' || action.kind === 'WAIT') {
      return;
    }

    const before = {
      level: step.levelNo,
      status: step.status,
      approver: step.approver?.displayName ?? null,
    };

    if (action.kind === 'ASSIGN') {
      const approverId = action.approverId;
      const result = await tx.approvalStep.updateMany({
        where: { id: step.id, status: step.status, approverId: step.approverId },
        data: { status: 'PENDING', approverId, assignedAt: new Date(), assignedById: actorId },
      });

      if (result.count === 0) {
        return;
      }

      await this.notify(tx, approverId, 'APPROVAL_PENDING', po.id, step.id, actorId);
      await this.recordLevelChange(tx, po, actorId, before, {
        level: step.levelNo,
        status: 'PENDING',
        approver: holders.find((holder) => holder.id === approverId)?.displayName ?? null,
      });

      return;
    }

    const result = await tx.approvalStep.updateMany({
      where: { id: step.id, status: 'PENDING', approverId: step.approverId },
      data: { status: 'ON_HOLD', approverId: null, assignedAt: null, assignedById: null },
    });

    if (result.count === 0) {
      return;
    }

    await this.notifyOnHold(tx, po, step.id, actorId);
    await this.recordLevelChange(tx, po, actorId, before, {
      level: step.levelNo,
      status: 'ON_HOLD',
      approver: null,
    });
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
        admin: null,
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
      admin: null,
    };
  }

  private async adminActions(
    po: ApprovalSubject,
    open: StepRow,
  ): Promise<ApprovalRouteAdminActions> {
    const makerId = po.submittedById ?? '';
    const holders = await holdersWithin(
      this.prisma,
      effectiveRoleId(open),
      po.companyId,
      po.projectId,
    );
    const higherRoles: ApprovalRouteHigherRole[] = [];

    if (open.status === 'ON_HOLD') {
      for (const role of await this.laterWorkflowRoles(po, open.levelNo)) {
        const roleHolders = await holdersWithin(this.prisma, role.id, po.companyId, po.projectId);

        higherRoles.push({
          role,
          candidates: roleHolders.filter((holder) => holder.id !== makerId),
        });
      }
    }

    return {
      levelNo: open.levelNo,
      status: open.status,
      candidates: holders.filter(
        (holder) => holder.id !== makerId && holder.id !== open.approverId,
      ),
      higherRoles,
    };
  }

  /** Active roles of the PO's workflow version above a level (OQ-119). */
  private async laterWorkflowRoles(
    po: ApprovalSubject,
    levelNo: number,
  ): Promise<ApprovalRoleSummary[]> {
    if (po.approvalWorkflowId === null) {
      return [];
    }

    const rows = await this.prisma.approvalWorkflowLevel.findMany({
      where: {
        workflowId: po.approvalWorkflowId,
        levelNo: { gt: levelNo },
        role: { isActive: true },
      },
      orderBy: { levelNo: 'asc' },
      select: { role: { select: { id: true, code: true, name: true } } },
    });

    return rows.map((row) => row.role);
  }

  private async roleSummaries(
    ids: readonly (string | null)[],
  ): Promise<Map<string, ApprovalRoleSummary>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];

    if (wanted.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.role.findMany({
      where: { id: { in: wanted } },
      select: { id: true, code: true, name: true },
    });

    return new Map(rows.map((row) => [row.id, row]));
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

  private async requireOpenStep(po: ApprovalSubject): Promise<StepRow> {
    const steps = await this.loadCycle(po);
    const open = steps.find((row) => row.status === 'PENDING' || row.status === 'ON_HOLD');

    if (open === undefined) {
      throw invalidPurchaseOrderStatus(NO_OPEN_LEVEL);
    }

    return open;
  }

  private async notifyOnHold(
    tx: Tx,
    po: PurchaseOrderRef,
    stepId: string,
    actorId: string,
  ): Promise<void> {
    await this.notify(tx, po.submittedById, 'APPROVAL_ON_HOLD', po.id, stepId, actorId);

    for (const adminId of await administratorIds(tx)) {
      await this.notify(tx, adminId, 'APPROVER_NEEDED', po.id, stepId, actorId);
    }
  }

  /** Approval level changes are kept in the PO's Audit Log (OQ-119). */
  private recordLevelChange(
    tx: Tx,
    po: PurchaseOrderRef,
    actorId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(tx, {
      actorUserId: actorId,
      action: 'UPDATE',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      companyId: po.companyId,
      before: { approvalLevel: before },
      after: { approvalLevel: after },
    });
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
