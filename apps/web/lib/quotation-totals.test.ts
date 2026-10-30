import { describe, expect, it } from 'vitest';
import { quotationTotals } from './quotation-totals';

const quoted = {
  isQuoted: true,
  quantity: '10.000',
  rate: '125.50',
  discountPercent: '5',
  gstRate: '18',
};

describe('quotationTotals', () => {
  it('matches the server rounding (line half-up, then sum)', () => {
    const totals = quotationTotals([quoted], [{ amount: '1000', gstRate: '18' }]);

    expect(totals.lineTotals).toEqual(['1406.86']);
    expect(totals).toMatchObject({
      subtotal: '1192.25',
      taxTotal: '214.61',
      chargesTotal: '1180.00',
      grandTotal: '2586.86',
    });
  });

  it('leaves out unquoted and incomplete lines and blank charges', () => {
    const totals = quotationTotals(
      [
        { ...quoted, isQuoted: false },
        { ...quoted, rate: '' },
        { ...quoted, gstRate: '101' },
      ],
      [{ amount: '', gstRate: '' }],
    );

    expect(totals.lineTotals).toEqual([null, null, null]);
    expect(totals.grandTotal).toBe('0.00');
  });

  it('treats a blank discount as 0', () => {
    expect(quotationTotals([{ ...quoted, discountPercent: '' }], []).subtotal).toBe('1255.00');
  });
});
