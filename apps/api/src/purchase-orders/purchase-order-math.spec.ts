import { pricePurchaseOrder, splitTax, taxTypeFor } from './purchase-order-math';

const line = {
  itemId: '00000000-0000-4000-8000-000000000001',
  comparisonLineId: null,
  remarks: null,
};

describe('taxTypeFor', () => {
  it('uses CGST + SGST in the same state, IGST across states, none when unregistered', () => {
    expect(taxTypeFor('s36', 's36')).toBe('CGST_SGST');
    expect(taxTypeFor('s36', 's37')).toBe('IGST');
    expect(taxTypeFor('s36', null)).toBe('NONE');
  });
});

describe('splitTax', () => {
  it('rounds each half separately so CGST always equals SGST', () => {
    // 0.55 at 5%: half of 2.75 paise each -> 1.375 -> 1 paisa each.
    expect(splitTax(55n, '5', 'CGST_SGST')).toEqual({ cgst: 1n, sgst: 1n, igst: 0n });
  });

  it('charges nothing for an unregistered vendor', () => {
    expect(splitTax(100_000n, '18', 'NONE')).toEqual({ cgst: 0n, sgst: 0n, igst: 0n });
  });
});

describe('pricePurchaseOrder', () => {
  it('splits CGST and SGST in the same state', () => {
    const result = pricePurchaseOrder(
      [{ ...line, quantity: '10', rate: '100', discountPercent: null, gstRate: '18' }],
      [],
      'CGST_SGST',
    );

    expect(result.problem).toBeNull();
    expect(result.priced?.lines[0]).toMatchObject({
      lineNo: 1,
      quantity: '10.000',
      rate: '100.0000',
      discountPercent: '0.00',
      taxableAmount: '1000.00',
      cgstAmount: '90.00',
      sgstAmount: '90.00',
      igstAmount: '0.00',
      lineTotal: '1180.00',
    });
    expect(result.priced).toMatchObject({
      subtotal: '1000.00',
      cgstTotal: '90.00',
      sgstTotal: '90.00',
      taxTotal: '180.00',
      grandTotal: '1180.00',
    });
  });

  it('applies the discount before IGST, half-up to paisa', () => {
    // 250.5 x 4 = 1002.00, less 10% = 901.80; IGST 18% = 162.324 -> 162.32.
    const result = pricePurchaseOrder(
      [{ ...line, quantity: '4', rate: '250.5', discountPercent: '10', gstRate: '18' }],
      [],
      'IGST',
    );

    expect(result.priced?.lines[0]).toMatchObject({
      taxableAmount: '901.80',
      igstAmount: '162.32',
      lineTotal: '1064.12',
    });
  });

  it('adds charges and their GST into the totals', () => {
    const result = pricePurchaseOrder(
      [{ ...line, quantity: '10', rate: '100', discountPercent: null, gstRate: '18' }],
      [{ chargeType: 'FREIGHT', description: null, amount: '500', gstRate: '18' }],
      'IGST',
    );

    expect(result.priced?.charges[0]).toMatchObject({ amount: '500.00', igstAmount: '90.00' });
    expect(result.priced).toMatchObject({
      subtotal: '1000.00',
      chargesAmount: '500.00',
      igstTotal: '270.00',
      taxTotal: '270.00',
      grandTotal: '1770.00',
    });
  });

  it('keeps the GST % but charges no GST for an unregistered vendor', () => {
    const result = pricePurchaseOrder(
      [{ ...line, quantity: '1', rate: '1000', discountPercent: null, gstRate: '18' }],
      [],
      'NONE',
    );

    expect(result.priced?.lines[0]).toMatchObject({ gstRate: '18.00', lineTotal: '1000.00' });
    expect(result.priced?.taxTotal).toBe('0.00');
  });

  it('refuses amounts that do not fit DECIMAL(18,2)', () => {
    const result = pricePurchaseOrder(
      [
        {
          ...line,
          quantity: '999999999999999',
          rate: '99999999999999.9999',
          discountPercent: null,
          gstRate: '18',
        },
      ],
      [],
      'IGST',
    );

    expect(result.problem).toBe('Line 1: the amount is too large.');
  });
});
