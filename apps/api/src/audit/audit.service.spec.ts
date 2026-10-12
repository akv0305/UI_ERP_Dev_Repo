import { jest } from '@jest/globals';
import { currentRequestId, requestContext } from '../common/context/request-context';
import { AuditService, sanitizeSnapshot } from './audit.service';

function setup() {
  const tx = { auditEvent: { create: jest.fn() } };

  return { tx, service: new AuditService() };
}

describe('AuditService.record', () => {
  it('writes through the transaction client it is given', async () => {
    const { tx, service } = setup();

    await service.record(tx as never, {
      actorUserId: 'actor',
      action: 'CREATE',
      entityType: 'Company',
      entityId: 'entity',
      companyId: 'company',
      before: null,
      after: { code: 'UIE' },
    });

    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'actor',
        action: 'CREATE',
        entityType: 'Company',
        entityId: 'entity',
        companyId: 'company',
        before: undefined,
        after: { code: 'UIE' },
        requestId: null,
      },
    });
  });

  it('takes the request id from the request context', async () => {
    const { tx, service } = setup();

    await requestContext.run({ requestId: 'req-123' }, async () => {
      expect(currentRequestId()).toBe('req-123');
      await service.record(tx as never, {
        actorUserId: null,
        action: 'UPDATE',
        entityType: 'Role',
        entityId: 'role',
      });
    });

    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestId: 'req-123', companyId: null }) as unknown,
    });
  });

  it('propagates a failing write so the surrounding transaction rolls back', async () => {
    const { tx, service } = setup();
    tx.auditEvent.create.mockRejectedValue(new Error('audit failed'));

    await expect(
      service.record(tx as never, {
        actorUserId: null,
        action: 'UPDATE',
        entityType: 'Role',
        entityId: 'role',
      }),
    ).rejects.toThrow('audit failed');
  });

  it('never stores passwordHash, tokenHash or other secrets', async () => {
    const { tx, service } = setup();

    await service.record(tx as never, {
      actorUserId: 'actor',
      action: 'UPDATE',
      entityType: 'User',
      entityId: 'user',
      before: { username: 'a', passwordHash: 'h1', nested: { tokenHash: 't1', keep: 1 } },
      after: { username: 'b', passwordHash: 'h2', temporaryPassword: 'x', apiSecret: 's' },
    });

    const data = (tx.auditEvent.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
      .data;

    expect(data.before).toEqual({ username: 'a', nested: { keep: 1 } });
    expect(data.after).toEqual({ username: 'b' });
    expect(JSON.stringify(data)).not.toMatch(/h1|h2|t1/);
  });
});

describe('sanitizeSnapshot', () => {
  it('converts dates to ISO strings and keeps arrays', () => {
    expect(sanitizeSnapshot({ at: new Date('2026-01-01T00:00:00Z'), roles: ['A', 'B'] })).toEqual({
      at: '2026-01-01T00:00:00.000Z',
      roles: ['A', 'B'],
    });
  });

  it('returns null for null and undefined', () => {
    expect(sanitizeSnapshot(null)).toBeNull();
    expect(sanitizeSnapshot(undefined)).toBeNull();
  });
});
