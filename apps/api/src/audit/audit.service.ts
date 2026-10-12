import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditAction, AuditEntityType } from '@uie/contracts';
import { currentRequestId } from '../common/context/request-context';

/** The part of a Prisma transaction client the audit trail needs. */
export type AuditTx = Pick<Prisma.TransactionClient, 'auditEvent'>;

export interface AuditRecordInput {
  actorUserId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  companyId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

const SECRET_KEY_NAMES = new Set([
  'password',
  'temporarypassword',
  'newpassword',
  'currentpassword',
  'token',
  'secret',
]);

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();

  return (
    SECRET_KEY_NAMES.has(lower) ||
    lower.endsWith('hash') ||
    lower.endsWith('secret') ||
    lower.endsWith('token')
  );
}

/** Deep copy that drops secret-looking keys and turns dates into ISO strings. */
export function sanitizeSnapshot(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSnapshot(item)) as Prisma.InputJsonValue;
  }

  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!isSecretKey(key) && item !== undefined) {
        result[key] = sanitizeSnapshot(item);
      }
    }

    return result;
  }

  return value as Prisma.InputJsonValue;
}

/** Nullable Json column: undefined stores SQL NULL. */
function toJsonField(
  snapshot: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  return sanitizeSnapshot(snapshot) ?? undefined;
}

@Injectable()
export class AuditService {
  /**
   * Writes one audit event using the SAME transaction client as the change it records,
   * so the change and its audit row commit or roll back together.
   */
  async record(tx: AuditTx, event: AuditRecordInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        companyId: event.companyId ?? null,
        before: toJsonField(event.before),
        after: toJsonField(event.after),
        requestId: currentRequestId() ?? null,
      },
    });
  }
}
