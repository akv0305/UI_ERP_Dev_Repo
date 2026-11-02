import { describe, expect, it } from 'vitest';
import { purchaseOrderTotals } from './purchase-order-totals';

const LINE = { quantity: '10', rate: '125.50', discountPercent: '', gstRate: '18' };

describe('purchaseOrderTotals', () => {
  it('splits CGST and SGST equally and adds charges', () => {
    const totals = purchaseOrderTotals([LINE], [{ amount: '1000', gstRate: '18' }], 'CGST_SGST');

    expect(totals.lineTotals).toEqual(['1480.90']);
    expect(totals.subtotal).toBe('1255.00');
    expect(totals.chargesAmount).toBe('1000.00');
    expect(totals.cgstTotal).toBe('202.95');
    expect(totals.sgstTotal).toBe('202.95');
    expect(totals.igstTotal).toBe('0.00');
    expect(totals.taxTotal).toBe('405.90');
    expect(totals.grandTotal).toBe('2660.90');
  });

  it('rounds each half separately, unlike IGST', () => {
    const tiny = { quantity: '1', rate: '0.05', discountPercent: '', gstRate: '18' };

    expect(purchaseOrderTotals([tiny], [], 'CGST_SGST').lineTotals).toEqual(['0.05']);
    expect(purchaseOrderTotals([tiny], [], 'IGST').lineTotals).toEqual(['0.06']);
  });

  it('charges no GST for an unregistered vendor and skips invalid lines', () => {
    const totals = purchaseOrderTotals([LINE, { ...LINE, rate: '' }], [], 'NONE');

    expect(totals.lineTotals).toEqual(['1255.00', null]);
    expect(totals.grandTotal).toBe('1255.00');
  });
});
