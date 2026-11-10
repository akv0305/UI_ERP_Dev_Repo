import { describe, expect, it } from 'vitest';
import { approvalBands } from './approval-bands';

const LADDER = [
  { minAmount: '0.00', roleName: 'PM' },
  { minAmount: '200000.00', roleName: 'VP' },
  { minAmount: '1000000.00', roleName: 'ED' },
  { minAmount: '2500000.00', roleName: 'FD' },
  { minAmount: '5000000.00', roleName: 'MD' },
];

describe('approvalBands', () => {
  it('gives the five cumulative PD-008 bands', () => {
    expect(approvalBands(LADDER)).toEqual([
      { from: '0.00', to: '200000.00', roles: ['PM'] },
      { from: '200000.00', to: '1000000.00', roles: ['PM', 'VP'] },
      { from: '1000000.00', to: '2500000.00', roles: ['PM', 'VP', 'ED'] },
      { from: '2500000.00', to: '5000000.00', roles: ['PM', 'VP', 'ED', 'FD'] },
      { from: '5000000.00', to: null, roles: ['PM', 'VP', 'ED', 'FD', 'MD'] },
    ]);
  });

  it('merges equal amounts written differently', () => {
    expect(
      approvalBands([
        { minAmount: '0', roleName: 'A' },
        { minAmount: '200000', roleName: 'B' },
        { minAmount: '200000.00', roleName: 'C' },
      ]),
    ).toEqual([
      { from: '0', to: '200000', roles: ['A'] },
      { from: '200000', to: null, roles: ['A', 'B', 'C'] },
    ]);
  });

  it('one level is one band with no upper limit', () => {
    expect(approvalBands([{ minAmount: '0', roleName: 'PM' }])).toEqual([
      { from: '0', to: null, roles: ['PM'] },
    ]);
  });
});
