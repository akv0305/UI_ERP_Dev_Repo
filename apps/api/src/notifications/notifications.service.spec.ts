import { jest } from '@jest/globals';
import type { PrismaService } from '../prisma/prisma.service';
import { ApprovalInboxService } from './approval-inbox.service';
import { isActionNeeded, NotificationsService, priorityOf } from './notifications.service';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PO_ID = '33333333-3333-4333-8333-333333333333';

function step(status: string, approverId: string | null) {
  return { levelNo: 2, status, approverId } as never;
}

function notificationRow(
  id: string,
  kind: string,
  createdAt: string,
  readAt: string | null,
  approvalStep: unknown,
) {
  return {
    id,
    userId: ME,
    kind,
    purchaseOrderId: PO_ID,
    approvalStepId: null,
    createdAt: new Date(createdAt),
    readAt: readAt === null ? null : new Date(readAt),
    purchaseOrder: {
      id: PO_ID,
      number: 'PO/TDV/2026-27/0001',
      revisionNo: 0,
      vendor: { legalName: 'ABC Traders' },
    },
    approvalStep,
  };
}

describe('isActionNeeded (OQ-130)', () => {
  it('approval request counts only while the level is Pending with me', () => {
    expect(
      isActionNeeded({ kind: 'APPROVAL_PENDING', approvalStep: step('PENDING', ME) }, ME),
    ).toBe(true);
    expect(
      isActionNeeded({ kind: 'APPROVAL_PENDING', approvalStep: step('APPROVED', ME) }, ME),
    ).toBe(false);
    expect(
      isActionNeeded({ kind: 'APPROVAL_PENDING', approvalStep: step('PENDING', OTHER) }, ME),
    ).toBe(false);
  });

  it('approver needed counts only while the level is On hold', () => {
    expect(
      isActionNeeded({ kind: 'APPROVER_NEEDED', approvalStep: step('ON_HOLD', null) }, ME),
    ).toBe(true);
    expect(
      isActionNeeded({ kind: 'APPROVER_NEEDED', approvalStep: step('PENDING', OTHER) }, ME),
    ).toBe(false);
  });

  it('outcome notifications never need action', () => {
    expect(isActionNeeded({ kind: 'PURCHASE_ORDER_APPROVED', approvalStep: null }, ME)).toBe(false);
  });

  it('orders action needed, then unread, then read', () => {
    expect(priorityOf({ actionNeeded: true, readAt: '2026-11-16T00:00:00.000Z' })).toBe(0);
    expect(priorityOf({ actionNeeded: false, readAt: null })).toBe(1);
    expect(priorityOf({ actionNeeded: false, readAt: '2026-11-16T00:00:00.000Z' })).toBe(2);
  });
});

describe('NotificationsService', () => {
  function setup(rows: unknown[] = [], unread = 0) {
    const prisma = {
      notification: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    };
    prisma.notification.findMany.mockResolvedValue(rows);
    prisma.notification.count.mockResolvedValue(unread);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    return { prisma, service: new NotificationsService(prisma as unknown as PrismaService) };
  }

  it('lists action needed first, then unread, then read (newest first in each group)', async () => {
    const { service } = setup(
      [
        notificationRow('a', 'PURCHASE_ORDER_APPROVED', '2026-11-16T10:00:00Z', null, null),
        notificationRow(
          'b',
          'PURCHASE_ORDER_REJECTED',
          '2026-11-16T09:00:00Z',
          '2026-11-16T09:30:00Z',
          null,
        ),
        notificationRow(
          'c',
          'APPROVAL_PENDING',
          '2026-11-15T08:00:00Z',
          '2026-11-15T08:10:00Z',
          step('PENDING', ME),
        ),
        notificationRow('d', 'PURCHASE_ORDER_CANCELLED', '2026-11-16T11:00:00Z', null, null),
      ],
      2,
    );

    const result = await service.list(ME);

    expect(result.items.map((item) => item.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(result.unreadCount).toBe(2);
    expect(result.items[0]?.purchaseOrder?.vendorName).toBe('ABC Traders');
  });

  it('marks read only the signed-in user’s unread row', async () => {
    const { prisma, service } = setup();

    await service.markRead(PO_ID, ME);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PO_ID, userId: ME, readAt: null } }),
    );
  });
});

describe('ApprovalInboxService', () => {
  function inboxRow(cycleNo: number, approvalCycle: number, status = 'PENDING') {
    return {
      id: `step-${cycleNo}`,
      cycleNo,
      levelNo: 2,
      status,
      routedRoleId: null,
      assignedAt: new Date('2026-11-16T05:00:00Z'),
      role: { id: OTHER, code: 'VP', name: 'Vice President' },
      purchaseOrder: {
        id: PO_ID,
        number: 'PO/TDV/2026-27/0001',
        revisionNo: 0,
        approvalCycle,
        subtotal: { toFixed: () => '350000.00' },
        grandTotal: { toFixed: () => '413000.00' },
        submittedAt: new Date('2026-11-16T04:00:00Z'),
        project: { code: 'TDV' },
        vendor: { legalName: 'ABC Traders' },
        submittedBy: { id: OTHER, displayName: 'Maker' },
      },
    };
  }

  it('keeps only the current cycle and gives no on-hold list to a non-administrator', async () => {
    const findMany = jest.fn();
    findMany.mockResolvedValue([inboxRow(2, 2), inboxRow(1, 2)]);
    const service = new ApprovalInboxService({
      approvalStep: { findMany },
    } as unknown as PrismaService);

    const result = await service.inbox(ME, false);

    expect(result.awaitingMe).toHaveLength(1);
    expect(result.awaitingMe[0]?.purchaseOrder.subtotal).toBe('350000.00');
    expect(result.onHold).toBeNull();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('gives an administrator the on-hold list', async () => {
    const findMany = jest.fn();
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([inboxRow(1, 1, 'ON_HOLD')]);
    const service = new ApprovalInboxService({
      approvalStep: { findMany },
    } as unknown as PrismaService);

    const result = await service.inbox(ME, true);

    expect(result.onHold?.[0]?.status).toBe('ON_HOLD');
  });
});
