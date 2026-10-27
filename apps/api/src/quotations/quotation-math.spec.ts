import {
  chargeTax,
  formatScaled,
  lineAmounts,
  priceQuotation,
  type EnquiryLineForQuotation,
  type PricingLineInput,
} from './quotation-math';

const LINE_1 = '11111111-1111-4111-8111-111111111111';
const LINE_2 = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';

const enquiryLines: EnquiryLineForQuotation[] = [
  {
    id: LINE_1,
    lineNo: 1,
    itemId: ITEM,
    itemCode: 'ITM-000001',
    quantity: '10.000',
    itemUsable: true,
  },
  {
    id: LINE_2,
    lineNo: 2,
    itemId: ITEM,
    itemCode: 'ITM-000002',
    quantity: '5.000',
    itemUsable: true,
  },
];

const quoted: PricingLineInput = {
  enquiryLineId: LINE_1,
  isQuoted: true,
  rate: '125.50',
  discountPercent: '5',
  gstRate: '18',
  makeBrand: null,
  remarks: null,
};

const notQuoted: PricingLineInput = {
  enquiryLineId: LINE_2,
  isQuoted: false,
  rate: '99',
  discountPercent: null,
  gstRate: '18',
  makeBrand: null,
  remarks: 'Not available',
};

describe('formatScaled', () => {
  it('pads small values', () => {
    expect(formatScaled(5n, 2)).toBe('0.05');
    expect(formatScaled(0n, 2)).toBe('0.00');
    expect(formatScaled(119225n, 2)).toBe('1192.25');
  });
});

describe('lineAmounts', () => {
  it('applies discount, then GST rounded half-up', () => {
    // 125.50 x 10 x 95% = 1192.25; GST 18% = 214.605 -> 214.61
    expect(lineAmounts('125.50', '10.000', '5', '18')).toEqual({ taxable: 119225n, tax: 21461n });
  });

  it('rounds the taxable amount half-up to the paisa', () => {
    // 0.3333 x 3 = 0.9999 -> 1.00
    expect(lineAmounts('0.3333', '3', '0', '0')).toEqual({ taxable: 100n, tax: 0n });
  });
});

describe('chargeTax', () => {
  it('computes GST on a charge', () => {
    expect(chargeTax('1000', '18')).toBe(18000n);
  });
});

describe('priceQuotation', () => {
  it('prices quoted lines, clears unquoted ones and adds charges', () => {
    const result = priceQuotation(
      enquiryLines,
      [notQuoted, quoted],
      [{ chargeType: 'FREIGHT', description: null, amount: '1000', gstRate: '18' }],
    );

    expect(result.problem).toBeNull();
    expect(result.priced?.lines.map((line) => line.lineNo)).toEqual([1, 2]);
    expect(result.priced?.lines[0]).toMatchObject({
      rate: '125.5000',
      discountPercent: '5.00',
      gstRate: '18.00',
      taxableAmount: '1192.25',
      taxAmount: '214.61',
      lineTotal: '1406.86',
    });
    expect(result.priced?.lines[1]).toMatchObject({
      isQuoted: false,
      rate: null,
      gstRate: null,
      remarks: 'Not available',
    });
    expect(result.priced?.charges[0]).toMatchObject({ amount: '1000.00', taxAmount: '180.00' });
    expect(result.priced).toMatchObject({
      subtotal: '1192.25',
      taxTotal: '214.61',
      chargesTotal: '1180.00',
      grandTotal: '2586.86',
    });
  });

  it('needs one row for every enquiry line', () => {
    expect(priceQuotation(enquiryLines, [quoted], []).problem).toBe(
      'Send one row for every line of the enquiry.',
    );
  });

  it('needs at least one quoted line', () => {
    expect(
      priceQuotation(enquiryLines, [{ ...quoted, isQuoted: false }, notQuoted], []).problem,
    ).toBe('Quote at least one line.');
  });

  it('refuses to quote an item that is no longer usable (OQ-27), but allows leaving it unquoted', () => {
    const blocked = enquiryLines.map((line) => ({ ...line, itemUsable: line.id !== LINE_2 }));

    expect(priceQuotation(blocked, [quoted, notQuoted], []).problem).toBeNull();
    expect(
      priceQuotation(blocked, [quoted, { ...notQuoted, isQuoted: true }], []).problem,
    ).toContain('ITM-000002');
  });
});
