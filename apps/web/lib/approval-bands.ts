import { compareAmounts } from '@uie/contracts';

export interface BandLevel {
  minAmount: string;
  roleName: string;
}

/** from = lower bound (value above it); to = upper bound inclusive, null = no upper limit. */
export interface ApprovalBand {
  from: string;
  to: string | null;
  roles: string[];
}

/**
 * Value ranges and who approves in each, in level order.
 * A level applies when the value is above its amount (PD-008 cumulative ladder, PD-054).
 */
export function approvalBands(levels: readonly BandLevel[]): ApprovalBand[] {
  const thresholds: string[] = [];

  for (const amount of levels.map((level) => level.minAmount).sort(compareAmounts)) {
    const last = thresholds.at(-1);

    if (last === undefined || compareAmounts(amount, last) !== 0) {
      thresholds.push(amount);
    }
  }

  return thresholds.map((from, index) => ({
    from,
    to: thresholds[index + 1] ?? null,
    roles: levels
      .filter((level) => compareAmounts(level.minAmount, from) <= 0)
      .map((level) => level.roleName),
  }));
}
