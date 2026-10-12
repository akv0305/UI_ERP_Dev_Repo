import { jest } from '@jest/globals';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditQueryService, entityLabelOf, startOfDayIst } from './audit-query.service';

const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ENTITY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    actorUserId: null,
    actor: null,
    action: 'UPDATE',
    entityType: 'Company',
    entityId: ENTITY_ID,
    companyId: null,
    before: { code: 'OLD' },
    after: { code: 'NEW' },
    requestId: 'req-1',
    ...overrides,
  };
}

function setup() {
  const prisma = {
    auditEvent: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };
  prisma.auditEvent.count.mockResolvedValue(0);
  prisma.auditEvent.findMany.mockResolvedValue([]);

  return { prisma, service: new AuditQueryService(prisma as unknown as PrismaService) };
}

describe('AuditQueryService.list', () => {
  it('applies every filter, with dates as whole IST days', async () => {
    const { prisma, service } = setup();

    await service.list({
      page: 2,
      pageSize: 10,
      entityType: 'Company',
      entityId: ENTITY_ID,
      actorUserId: 'actor',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
    });

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        where: {
          entityType: 'Company',
          entityId: ENTITY_ID,
          actorUserId: 'actor',
          occurredAt: {
            gte: new Date('2026-02-28T18:30:00.000Z'),
            lt: new Date('2026-03-31T18:30:00.000Z'),
          },
        },
      }),
    );
  });

  it('uses no where conditions without filters', async () => {
    const { prisma, service } = setup();

    await service.list({ page: 1, pageSize: 20 });

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('labels each event with the record code or name', async () => {
    const { prisma, service } = setup();
    prisma.auditEvent.count.mockResolvedValue(1);
    prisma.auditEvent.findMany.mockResolvedValue([eventRow()]);

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.items[0]?.entityLabel).toBe('NEW');
    expect(result.total).toBe(1);
  });
});

describe('AuditQueryService.get', () => {
  it('returns before and after snapshots', async () => {
    const { prisma, service } = setup();
    prisma.auditEvent.findUnique.mockResolvedValue(eventRow());

    const result = await service.get(EVENT_ID);

    expect(result.before).toEqual({ code: 'OLD' });
    expect(result.after).toEqual({ code: 'NEW' });
    expect(result.requestId).toBe('req-1');
  });

  it('throws NOT_FOUND for an unknown event', async () => {
    const { prisma, service } = setup();
    prisma.auditEvent.findUnique.mockResolvedValue(null);

    await expect(service.get(EVENT_ID)).rejects.toMatchObject({ status: 404 });
  });
});

describe('helpers', () => {
  it('startOfDayIst is midnight in UTC+05:30', () => {
    expect(startOfDayIst('2026-01-01').toISOString()).toBe('2025-12-31T18:30:00.000Z');
  });

  it('entityLabelOf falls back to the before snapshot, then the id', () => {
    expect(entityLabelOf({ before: { username: 'u1' }, after: null, entityId: 'x' })).toBe('u1');
    expect(entityLabelOf({ before: null, after: { passwordReset: true }, entityId: 'x' })).toBe(
      'x',
    );
  });
});
