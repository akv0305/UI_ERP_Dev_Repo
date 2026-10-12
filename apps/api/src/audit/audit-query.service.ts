import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuditEvent, Prisma, User } from '@prisma/client';
import type {
  AuditEventDetail,
  AuditEventListQuery,
  AuditEventSummary,
  AuditSnapshot,
  PagedAuditEventsResponse,
} from '@uie/contracts';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';

type AuditEventWithActor = AuditEvent & {
  actor: Pick<User, 'id' | 'username' | 'displayName'> | null;
};

const actorSelect = { select: { id: true, username: true, displayName: true } } as const;

// Dates are calendar days in India Standard Time (UTC+05:30, no daylight saving).
const IST_OFFSET = '+05:30';
const DAY_MS = 24 * 60 * 60 * 1000;
const LABEL_KEYS = ['code', 'username', 'gstin', 'name', 'legalName', 'displayName'] as const;

export function startOfDayIst(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000${IST_OFFSET}`);
}

export function startOfNextDayIst(isoDate: string): Date {
  return new Date(startOfDayIst(isoDate).getTime() + DAY_MS);
}

function asSnapshot(value: Prisma.JsonValue | null): AuditSnapshot | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as AuditSnapshot)
    : null;
}

/** Human-readable identifier of the audited record, taken from its snapshots. */
export function entityLabelOf(event: Pick<AuditEvent, 'before' | 'after' | 'entityId'>): string {
  for (const snapshot of [asSnapshot(event.after), asSnapshot(event.before)]) {
    for (const key of LABEL_KEYS) {
      const value = snapshot?.[key];

      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }

  return event.entityId;
}

function toSummary(event: AuditEventWithActor): AuditEventSummary {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    actor: event.actor,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    entityLabel: entityLabelOf(event),
    companyId: event.companyId,
  };
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditEventListQuery): Promise<PagedAuditEventsResponse> {
    const where: Prisma.AuditEventWhereInput = {};

    if (query.entityType !== undefined) {
      where.entityType = query.entityType;
    }

    if (query.entityId !== undefined) {
      where.entityId = query.entityId;
    }

    if (query.actorUserId !== undefined) {
      where.actorUserId = query.actorUserId;
    }

    if (query.fromDate !== undefined || query.toDate !== undefined) {
      where.occurredAt = {
        ...(query.fromDate === undefined ? {} : { gte: startOfDayIst(query.fromDate) }),
        ...(query.toDate === undefined ? {} : { lt: startOfNextDayIst(query.toDate) }),
      };
    }

    const [total, events] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        include: { actor: actorSelect },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: events.map(toSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AuditEventDetail> {
    const event = await this.prisma.auditEvent.findUnique({
      where: { id },
      include: { actor: actorSelect },
    });

    if (event === null) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Audit event not found');
    }

    return {
      ...toSummary(event),
      requestId: event.requestId,
      before: asSnapshot(event.before),
      after: asSnapshot(event.after),
    };
  }
}
