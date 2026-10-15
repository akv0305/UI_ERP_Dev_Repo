import type { ItemImportRowInput } from '@uie/contracts';
import { checkRows, isSimilar, summarise, unitKey, type ImportRefs } from './import-matching';

const NOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CUM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const INACTIVE_UNIT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const ELECTRICAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const AGGREGATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

const REFS: ImportRefs = {
  units: [
    { id: NOS, code: 'NOS', name: 'Numbers' },
    { id: CUM, code: 'CUM', name: 'Cubic metre' },
  ],
  categories: [
    { id: ELECTRICAL, code: 'IG-0001', name: 'Electrical Material' },
    { id: AGGREGATE, code: 'IG-0002', name: 'Aggregate' },
  ],
  items: [
    {
      code: 'ITM-000001',
      description: 'Ceiling Fan',
      size: '1200mm',
      unitId: NOS,
      categoryId: ELECTRICAL,
    },
  ],
};

function row(rowNumber: number, overrides: Partial<ItemImportRowInput> = {}): ItemImportRowInput {
  return {
    rowNumber,
    description: 'LED Bulb',
    size: '9W',
    unitText: "No's",
    categoryText: 'Electrical Material',
    unitId: null,
    categoryId: null,
    hsnCode: '',
    gstRate: '',
    itemUse: 'STOCK_AND_ISSUE',
    ...overrides,
  };
}

function codes(result: { issues: { code: string }[] }): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('unitKey', () => {
  it('treats spelling variants as the same unit', () => {
    expect(unitKey("No's")).toBe(unitKey('NOS'));
    expect(unitKey('Nos')).toBe(unitKey('No'));
    expect(unitKey('Per Cum')).toBe(unitKey('CUM'));
    expect(unitKey('Mtrs')).toBe(unitKey('Mtr'));
    expect(unitKey('Sft')).not.toBe(unitKey('Sqft'));
  });
});

describe('isSimilar', () => {
  it('flags a near spelling but not identical text or different numbers', () => {
    expect(isSimilar('celling fan', 'ceiling fan')).toBe(true);
    expect(isSimilar('ceiling fan', 'ceiling fan')).toBe(false);
    expect(isSimilar('bolt 10mm', 'bolt 12mm')).toBe(false);
    expect(isSimilar('cement', 'aggregate')).toBe(false);
  });
});

describe('checkRows', () => {
  it('matches unit and category by spelling: READY with ids filled in', () => {
    const [result] = checkRows([row(3)], REFS);

    expect(result).toMatchObject({ status: 'READY', unitId: NOS, categoryId: ELECTRICAL });
  });

  it('marks a blank unit UNIT_REQUIRED and an unknown one UNIT_NOT_MATCHED', () => {
    const results = checkRows(
      [
        row(3, { unitText: '' }),
        row(4, { unitText: 'Sft' }),
        row(5, { unitText: 'Sft', size: '' }),
      ],
      REFS,
    );

    expect(codes(results[0]!)).toEqual(['UNIT_REQUIRED']);
    expect(codes(results[1]!)).toEqual(['UNIT_NOT_MATCHED']);
    expect(results[1]!.status).toBe('ERROR');
    expect(summarise(results).unmatchedUnits).toEqual([{ text: 'Sft', rows: 2 }]);
  });

  it('marks a blank group CATEGORY_REQUIRED and an unknown one CATEGORY_NOT_MATCHED', () => {
    const results = checkRows(
      [
        row(3, { categoryText: '' }),
        row(4, { description: 'Spanner Set', categoryText: 'Plant Spares' }),
      ],
      REFS,
    );

    expect(codes(results[0]!)).toEqual(['CATEGORY_REQUIRED']);
    expect(codes(results[1]!)).toEqual(['CATEGORY_NOT_MATCHED']);
  });

  it('accepts a unit picked in the grid even when the spelling does not match', () => {
    const [result] = checkRows([row(3, { unitText: 'Sft', unitId: CUM })], REFS);

    expect(result).toMatchObject({ status: 'READY', unitId: CUM });
  });

  it('refuses a picked unit that is no longer active', () => {
    const [result] = checkRows([row(3, { unitId: INACTIVE_UNIT })], REFS);

    expect(codes(result!)).toEqual(['UNIT_NOT_MATCHED']);
    expect(result!.unitId).toBeNull();
  });

  it('flags an existing item as DUPLICATE_EXISTING, ignoring case and spacing', () => {
    const [result] = checkRows(
      [row(3, { description: ' ceiling   FAN ', size: '1200MM', unitText: 'Nos' })],
      REFS,
    );

    expect(result!.status).toBe('ERROR');
    expect(result!.issues[0]).toMatchObject({ code: 'DUPLICATE_EXISTING', refCode: 'ITM-000001' });
  });

  it('keeps the first of two identical rows and flags the second DUPLICATE_IN_FILE', () => {
    const results = checkRows([row(223), row(224)], REFS);

    expect(results[0]!.status).toBe('READY');
    expect(results[1]!.issues[0]).toMatchObject({ code: 'DUPLICATE_IN_FILE', refRow: 223 });
  });

  it('imports an edited duplicate once it differs', () => {
    const results = checkRows([row(223), row(224, { size: '12W' })], REFS);

    expect(results.map((result) => result.status)).toEqual(['READY', 'READY']);
  });

  it('warns about a near spelling of an existing item in the same category and size', () => {
    const [result] = checkRows([row(3, { description: 'Celling Fan', size: '1200mm' })], REFS);

    expect(result!.status).toBe('WARNING');
    expect(result!.issues[0]).toMatchObject({
      code: 'SIMILAR_EXISTING',
      severity: 'warning',
      refCode: 'ITM-000001',
    });
  });

  it('does not compare across sizes', () => {
    const [result] = checkRows([row(3, { description: 'Ceiling Fan', size: '900mm' })], REFS);

    expect(result!.status).toBe('READY');
  });

  it('warns about a near spelling of an earlier row in the file', () => {
    const results = checkRows(
      [row(10, { description: 'Flexible Pipe' }), row(11, { description: 'Flexble Pipe' })],
      REFS,
    );

    expect(results[0]!.status).toBe('READY');
    expect(results[1]!.issues[0]).toMatchObject({ code: 'SIMILAR_IN_FILE', refRow: 10 });
  });

  it('checks HSN and GST %, accepting a trailing percent sign', () => {
    const results = checkRows(
      [
        row(3, { hsnCode: '123' }),
        row(4, { description: 'Tube Light', gstRate: '18%' }),
        row(5, { description: 'Switch', gstRate: '101' }),
      ],
      REFS,
    );

    expect(codes(results[0]!)).toEqual(['INVALID_HSN']);
    expect(results[1]).toMatchObject({ status: 'READY', gstRate: '18' });
    expect(codes(results[2]!)).toEqual(['INVALID_GST_RATE']);
  });

  it('summarises counts per colour', () => {
    const summary = summarise(
      checkRows(
        [row(1), row(2, { unitText: '' }), row(3, { description: 'Celling Fan', size: '1200mm' })],
        REFS,
      ),
    ).summary;

    expect(summary).toEqual({ total: 3, ready: 1, warning: 1, error: 1 });
  });
});
