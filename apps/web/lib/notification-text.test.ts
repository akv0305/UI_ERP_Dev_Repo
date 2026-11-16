import { describe, expect, it } from 'vitest';
import {
  actorAtText,
  badgeText,
  levelText,
  notificationDetail,
  poNumberText,
} from './notification-text';

describe('notification text', () => {
  it('shows the revision only after the first', () => {
    expect(poNumberText({ number: 'PO/TDV/2026-27/0001', revisionNo: 0 })).toBe(
      'PO/TDV/2026-27/0001',
    );
    expect(poNumberText({ number: 'PO/TDV/2026-27/0001', revisionNo: 2 })).toBe(
      'PO/TDV/2026-27/0001 R2',
    );
  });

  it('caps the badge at 9+', () => {
    expect(badgeText(3)).toBe('3');
    expect(badgeText(12)).toBe('9+');
  });

  it('marks a routed level', () => {
    expect(levelText(3, 'Executive Director', true)).toBe('Level 3 · Executive Director (routed)');
  });

  it('shows who and when in IST, or the not-set mark', () => {
    expect(actorAtText({ displayName: 'Ravi' }, '2026-11-16T05:00:00.000Z', '-')).toBe(
      'Ravi · 16-11-2026 10:30',
    );
    expect(actorAtText(null, null, '-')).toBe('-');
  });

  it('joins PO, vendor, level and time', () => {
    expect(
      notificationDetail({
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'APPROVAL_PENDING',
        createdAt: '2026-11-16T05:00:00.000Z',
        readAt: null,
        actionNeeded: true,
        levelNo: 2,
        purchaseOrder: {
          id: '22222222-2222-4222-8222-222222222222',
          number: 'PO/TDV/2026-27/0001',
          revisionNo: 0,
          vendorName: 'ABC Traders',
        },
      }),
    ).toBe('PO/TDV/2026-27/0001 · ABC Traders · Level 2 · 16-11-2026 10:30');
  });
});
