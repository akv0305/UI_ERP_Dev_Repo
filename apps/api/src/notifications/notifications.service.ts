import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  MAX_NOTIFICATIONS_LISTED,
  type NotificationListResponse,
  type NotificationResponse,
  type UnreadNotificationCountResponse,
} from '@uie/contracts';
import { PrismaService } from '../prisma/prisma.service';

const notificationInclude = {
  purchaseOrder: {
    select: { id: true, number: true, revisionNo: true, vendor: { select: { legalName: true } } },
  },
  approvalStep: { select: { levelNo: true, status: true, approverId: true } },
} satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

/** The level behind the notification still waits for this user (OQ-130). */
export function isActionNeeded(
  row: Pick<NotificationRow, 'kind' | 'approvalStep'>,
  userId: string,
): boolean {
  const step = row.approvalStep;

  if (step === null) {
    return false;
  }

  if (row.kind === 'APPROVAL_PENDING') {
    return step.status === 'PENDING' && step.approverId === userId;
  }

  if (row.kind === 'APPROVER_NEEDED') {
    return step.status === 'ON_HOLD';
  }

  return false;
}

/** 0 = action needed, 1 = unread, 2 = read (OQ-130). */
export function priorityOf(item: Pick<NotificationResponse, 'actionNeeded' | 'readAt'>): number {
  if (item.actionNeeded) {
    return 0;
  }

  return item.readAt === null ? 1 : 2;
}

function byPriority(a: NotificationResponse, b: NotificationResponse): number {
  const difference = priorityOf(a) - priorityOf(b);

  if (difference !== 0) {
    return difference;
  }

  // ISO strings in UTC compare correctly as text; newest first.
  return b.createdAt.localeCompare(a.createdAt);
}

function toResponse(row: NotificationRow, userId: string): NotificationResponse {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    actionNeeded: isActionNeeded(row, userId),
    levelNo: row.approvalStep?.levelNo ?? null,
    purchaseOrder:
      row.purchaseOrder === null
        ? null
        : {
            id: row.purchaseOrder.id,
            number: row.purchaseOrder.number,
            revisionNo: row.purchaseOrder.revisionNo,
            vendorName: row.purchaseOrder.vendor.legalName,
          },
  };
}

/** Only the signed-in user's own rows; reads are not audited (not business data). */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<NotificationListResponse> {
    const [rows, count] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        // Unread (readAt null) first, so the 30 always include the newest unread.
        orderBy: [{ readAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: MAX_NOTIFICATIONS_LISTED,
        include: notificationInclude,
      }),
      this.unreadCount(userId),
    ]);

    return {
      items: rows.map((row) => toResponse(row, userId)).sort(byPriority),
      unreadCount: count.unreadCount,
    };
  }

  async unreadCount(userId: string): Promise<UnreadNotificationCountResponse> {
    const unreadCount = await this.prisma.notification.count({ where: { userId, readAt: null } });

    return { unreadCount };
  }

  /** Another user's id, or an already read one, changes nothing (no error, nothing revealed). */
  async markRead(id: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
