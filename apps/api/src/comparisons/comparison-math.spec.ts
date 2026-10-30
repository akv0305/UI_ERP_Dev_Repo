import {
  buildGrid,
  netRateOf,
  ranksOf,
  selectionProblem,
  type GridEnquiryLine,
  type GridQuotation,
} from './comparison-math';

const LINE_1 = '11111111-1111-4111-8111-111111111111';
const LINE_2 = '22222222-2222-4222-8222-222222222222';
const VENDOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENDOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const item = {
  id: '33333333-3333-4333-8333-333333333333',
  code: 'ITM-000001',
  description: 'Cement OPC 53',
  size: null,
  unitCode: 'BAG',
  decimalPlaces: 0,
};

const enquiryLines: GridEnquiryLine[] = [
  { enquiryLineId: LINE_2, lineNo: 2, item, quantity: '5' },
  { enquiryLineId: LINE_1, lineNo: 1, item, quantity: '10' },
];

function quotation(
  vendorId: string,
  code: string,
  validUntil: string | null,
  lines: GridQuotation['lines'],
): GridQuotation {
  return {
    quotationId: `${vendorId.slice(0, 8)}-0000-4000-8000-000000000000`,
    quotationLabel: `QTN/TDV/2026-27/${code}`,
    vendor: { id: vendorId, code, legalName: code },
    quoteDate: '2026-10-20',
    validUntil,
    deliveryDays: null,
    paymentTermsDays: null,
    subtotal: '0.00',
    taxTotal: '0.00',
    chargesTotal: '0.00',
    grandTotal: '0.00',
    lines,
  };
}

function quoted(id: string, enquiryLineId: string, rate: string, discount: string | null) {
  return {
    quotationLineId: id,
    enquiryLineId,
    isQuoted: true,
    rate,
    discountPercent: discount,
    gstRate: '18.00',
    taxableAmount: '1.00',
    lineTotal: '1.18',
    makeBrand: null,
  };
}

function notQuoted(id: string, enquiryLineId: string) {
  return {
    quotationLineId: id,
    enquiryLineId,
    isQuoted: false,
    rate: null,
    discountPercent: null,
    gstRate: null,
    taxableAmount: null,
    lineTotal: null,
    makeBrand: null,
  };
}

// Vendor B (code V2) is listed first in the input; the grid must sort by code.
const quotations: GridQuotation[] = [
  quotation(VENDOR_B, 'V2', null, [
    quoted('b1000000-0000-4000-8000-000000000000', LINE_1, '95', null),
    notQuoted('b2000000-0000-4000-8000-000000000000', LINE_2),
  ]),
  quotation(VENDOR_A, 'V1', '2026-10-01', [
    quoted('a1000000-0000-4000-8000-000000000000', LINE_1, '100', '10'),
    quoted('a2000000-0000-4000-8000-000000000000', LINE_2, '50', null),
  ]),
];

describe('netRateOf', () => {
  it('applies the discount and rounds half-up to 4 decimals', () => {
    expect(netRateOf('125.5', '2.5')).toBe('122.3625');
    expect(netRateOf('100', '0')).toBe('100.0000');
    expect(netRateOf('0.0001', '50')).toBe('0.0001');
  });
});

describe('ranksOf', () => {
  it('gives equal rates the same rank and skips nulls', () => {
    expect(ranksOf(['90.0000', '90.0000', '95.0000', null])).toEqual([1, 1, 3, null]);
  });
});

describe('buildGrid', () => {
  const grid = buildGrid(enquiryLines, quotations, '2026-10-30');

  it('sorts vendors by code and lines by number, and flags expired quotations', () => {
    expect(grid.vendors.map((vendor) => vendor.vendor.code)).toEqual(['V1', 'V2']);
    expect(grid.vendors.map((vendor) => vendor.isExpired)).toEqual([true, false]);
    expect(grid.lines.map((line) => line.lineNo)).toEqual([1, 2]);
  });

  it('ranks by net rate: 100 less 10% beats 95', () => {
    const [first] = grid.lines;

    expect(first?.offers.map((offer) => [offer.netRate, offer.rank])).toEqual([
      ['90.0000', 1],
      ['95.0000', 2],
    ]);
  });

  it('leaves unquoted offers without rate or rank', () => {
    const second = grid.lines[1];

    expect(second?.offers.map((offer) => offer.rank)).toEqual([1, null]);
  });
});

describe('selectionProblem', () => {
  const grid = buildGrid(enquiryLines, quotations, '2026-10-30');

  it('needs one row per enquiry line', () => {
    expect(
      selectionProblem(
        grid,
        [{ enquiryLineId: LINE_1, selectedVendorId: null, reason: null }],
        false,
      )?.code,
    ).toBe('INVALID_LINES');
  });

  it('refuses a vendor that did not quote the line', () => {
    expect(
      selectionProblem(
        grid,
        [
          { enquiryLineId: LINE_1, selectedVendorId: null, reason: null },
          { enquiryLineId: LINE_2, selectedVendorId: VENDOR_B, reason: null },
        ],
        false,
      )?.code,
    ).toBe('INVALID_SELECTION');
  });

  it('allows a non-L1 choice without reason in a draft, but not when finalising', () => {
    const inputs = [
      { enquiryLineId: LINE_1, selectedVendorId: VENDOR_B, reason: null },
      { enquiryLineId: LINE_2, selectedVendorId: null, reason: null },
    ];

    expect(selectionProblem(grid, inputs, false)).toBeNull();
    expect(selectionProblem(grid, inputs, true)?.code).toBe('REASON_REQUIRED');
  });

  it('needs at least one choice to finalise', () => {
    expect(
      selectionProblem(
        grid,
        [
          { enquiryLineId: LINE_1, selectedVendorId: null, reason: null },
          { enquiryLineId: LINE_2, selectedVendorId: null, reason: null },
        ],
        true,
      )?.code,
    ).toBe('NOTHING_SELECTED');
  });

  it('accepts L1 choices and a reasoned non-L1 choice', () => {
    expect(
      selectionProblem(
        grid,
        [
          { enquiryLineId: LINE_1, selectedVendorId: VENDOR_B, reason: 'Faster delivery' },
          { enquiryLineId: LINE_2, selectedVendorId: VENDOR_A, reason: null },
        ],
        true,
      ),
    ).toBeNull();
  });
});
