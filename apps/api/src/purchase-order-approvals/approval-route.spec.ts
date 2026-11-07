import {
  advance,
  applicableLevels,
  planSubmit,
  type Holder,
  type HoldersByLevel,
  type RouteLevel,
} from './approval-route';

function level(levelNo: number, roleCode: string, minAmount: string, maker = false): RouteLevel {
  return {
    levelNo,
    roleId: `role-${roleCode}`,
    roleCode,
    roleName: roleCode,
    minAmount,
    makerCountsAsApproved: maker,
  };
}

const LADDER = [
  level(1, 'PM', '0.00', true),
  level(2, 'VP', '200000.00'),
  level(3, 'ED', '1000000.00'),
  level(4, 'FD', '2500000.00'),
  level(5, 'MD', '5000000.00'),
];

function holders(map: Record<number, string[]>): HoldersByLevel {
  return new Map(
    Object.entries(map).map(([key, ids]): [number, Holder[]] => [
      Number(key),
      ids.map((id) => ({ id, displayName: id })),
    ]),
  );
}

const roles = (amount: string) => applicableLevels(LADDER, amount).map((row) => row.roleCode);
const base = { projectCode: 'TDV', chosenApproverId: null };

describe('applicableLevels', () => {
  it('takes level 1 always and later levels only above their amount (PD-008)', () => {
    expect(roles('150000.00')).toEqual(['PM']);
    expect(roles('200000.00')).toEqual(['PM']);
    expect(roles('1500000.00')).toEqual(['PM', 'VP', 'ED']);
    expect(roles('6000000.00')).toEqual(['PM', 'VP', 'ED', 'FD', 'MD']);
  });
});

describe('planSubmit', () => {
  it('approves at once when a Purchase Manager submits up to 2L (OQ-98 b)', () => {
    const result = planSubmit({
      ...base,
      levels: applicableLevels(LADDER, '150000.00'),
      holders: holders({ 1: ['pm1'] }),
      makerId: 'pm1',
    });

    expect(result).toEqual({
      ok: true,
      finished: true,
      changes: [{ levelNo: 1, status: 'APPROVED', decision: 'MAKER_SUBMIT', approverId: 'pm1' }],
    });
  });

  it('sends to the only VP after a Purchase Manager submit', () => {
    const result = planSubmit({
      ...base,
      levels: applicableLevels(LADDER, '500000.00'),
      holders: holders({ 1: ['pm1'], 2: ['vp1'] }),
      makerId: 'pm1',
    });

    expect(result).toEqual({
      ok: true,
      finished: false,
      changes: [
        { levelNo: 1, status: 'APPROVED', decision: 'MAKER_SUBMIT', approverId: 'pm1' },
        { levelNo: 2, status: 'PENDING', decision: null, approverId: 'vp1' },
      ],
    });
  });

  it('needs a choice when several hold the next role, and checks it', () => {
    const input = {
      ...base,
      levels: applicableLevels(LADDER, '500000.00'),
      holders: holders({ 1: ['pm1'], 2: ['vp1', 'vp2'] }),
      makerId: 'pm1',
    };

    const missing = planSubmit(input);
    const chosen = planSubmit({ ...input, chosenApproverId: 'vp2' });
    const wrong = planSubmit({ ...input, chosenApproverId: 'someone' });

    expect(missing.ok ? null : missing.problem.code).toBe('APPROVER_REQUIRED');
    expect(chosen.ok ? chosen.changes[1] : null).toEqual({
      levelNo: 2,
      status: 'PENDING',
      decision: null,
      approverId: 'vp2',
    });
    expect(wrong.ok ? null : wrong.problem.code).toBe('INVALID_APPROVER');
  });

  it('sends level 1 to a Purchase Manager when the maker is not one', () => {
    const result = planSubmit({
      ...base,
      levels: applicableLevels(LADDER, '500000.00'),
      holders: holders({ 1: ['pm1'], 2: ['vp1'] }),
      makerId: 'buyer',
    });

    expect(result).toEqual({
      ok: true,
      finished: false,
      changes: [{ levelNo: 1, status: 'PENDING', decision: null, approverId: 'pm1' }],
    });
  });

  it('refuses Submit when a level has no holder (OQ-104)', () => {
    const result = planSubmit({
      ...base,
      levels: applicableLevels(LADDER, '1500000.00'),
      holders: holders({ 1: ['pm1'], 2: ['vp1'] }),
      makerId: 'pm1',
    });

    expect(result.ok ? null : result.problem).toEqual(
      expect.objectContaining({ code: 'NO_APPROVER', levelNo: 3 }),
    );
  });

  it('never lets the maker approve above level 1', () => {
    const result = planSubmit({
      ...base,
      levels: applicableLevels(LADDER, '500000.00'),
      holders: holders({ 1: ['pm1'], 2: ['pm1'] }),
      makerId: 'pm1',
    });

    expect(result.ok ? null : result.problem.code).toBe('NO_APPROVER');
  });
});

describe('advance', () => {
  it('records the same approver on the next level and assigns the following one (OQ-94 c)', () => {
    const levels = applicableLevels(LADDER, '3000000.00').slice(2);
    const result = advance({
      ...base,
      levels,
      holders: holders({ 3: ['vp1'], 4: ['fd1'] }),
      makerId: 'pm1',
      previousApproverId: 'vp1',
    });

    expect(result).toEqual({
      ok: true,
      finished: false,
      changes: [
        { levelNo: 3, status: 'APPROVED', decision: 'SAME_APPROVER', approverId: 'vp1' },
        { levelNo: 4, status: 'PENDING', decision: null, approverId: 'fd1' },
      ],
    });
  });

  it('finishes when no level is left', () => {
    expect(
      advance({
        ...base,
        levels: [],
        holders: holders({}),
        makerId: 'pm1',
        previousApproverId: 'vp1',
      }),
    ).toEqual({ ok: true, changes: [], finished: true });
  });
});
