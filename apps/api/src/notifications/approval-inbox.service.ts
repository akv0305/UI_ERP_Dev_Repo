import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ApprovalInboxItem, ApprovalInboxResponse } from '@uie/contracts';
import { PrismaService } from '../prisma/prisma.service';

const inboxInclude = {
  role: { select: { id: true, code: true, name: true } },
  purchaseOrder: {
    select: {
      id: true,
      number: true,
      revisionNo: true,
      approvalCycle: true,
      subtotal: true,
      grandTotal: true,
      submittedAt: true,
      project: { select: { code: true } },
      vendor: { select: { legalName: true } },
      submittedBy: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.ApprovalStepInclude;

type InboxRow = Prisma.ApprovalStepGetPayload<{ include: typeof inboxInclude }>;

/** Only the PO's current cycle counts (older cycles are closed on Reject / Cancel). */
export function currentCycleOnly(rows: readonly InboxRow[]): InboxRow[] {
  return rows.filter((row) => row.cycleNo === row.purchaseOrder.approvalCycle);
}

function toItem(row: InboxRow): ApprovalInboxItem {
  const po = row.purchaseOrder;

  return {
    purchaseOrder: {
      id: po.id,
      number: po.number,
      revisionNo: po.revisionNo,
      projectCode: po.project.code,
      vendorName: po.vendor.legalName,
      subtotal: po.subtotal.toFixed(2),
      grandTotal: po.grandTotal.toFixed(2),
      submittedAt: po.submittedAt?.toISOString() ?? null,
      submittedBy: po.submittedBy,
    },
    levelNo: row.levelNo,
    role: row.role,
    routed: row.routedRoleId !== null,
    status: row.status === 'ON_HOLD' ? 'ON_HOLD' : 'PENDING',
    assignedAt: row.assignedAt?.toISOString() ?? null,
  };
}

/** Home "Waiting for my approval" and, for an Administrator, "Levels on hold" (OQ-118, OQ-131). */
@Injectable()
export class ApprovalInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(userId: string, isAdministrator: boolean): Promise<ApprovalInboxResponse> {
    const [mine, held] = await Promise.all([
      this.prisma.approvalStep.findMany({
        where: { status: 'PENDING', approverId: userId, purchaseOrder: { status: 'SUBMITTED' } },
        orderBy: { assignedAt: 'asc' },
        include: inboxInclude,
      }),
      isAdministrator
        ? this.prisma.approvalStep.findMany({
            where: { status: 'ON_HOLD', purchaseOrder: { status: 'SUBMITTED' } },
            orderBy: { purchaseOrder: { submittedAt: 'asc' } },
            include: inboxInclude,
          })
        : Promise.resolve(null),
    ]);

    return {
      awaitingMe: currentCycleOnly(mine).map(toItem),
      onHold: held === null ? null : currentCycleOnly(held).map(toItem),
    };
  }
}
