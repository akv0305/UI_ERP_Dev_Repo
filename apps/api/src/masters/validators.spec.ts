import {
  CreateCompanyRequest,
  gstinCheckCharacter,
  isValidCin,
  isValidGstin,
  isValidLlpin,
  isValidMasterCode,
  isValidPan,
  isValidPhone,
  isValidPinCode,
  isValidTan,
  panOfGstin,
  stateCodeOfGstin,
} from '@uie/contracts';

function withLastChanged(gstin: string): string {
  const last = gstin.slice(-1);

  return gstin.slice(0, -1) + (last === 'A' ? 'B' : 'A');
}

describe('GSTIN validation', () => {
  it.each(['36AABCU3675K1ZY', '37AABCU3675K2ZV'])('accepts %s', (gstin) => {
    expect(isValidGstin(gstin)).toBe(true);
  });

  it.each(['36AABCU3675K1ZY', '37AABCU3675K2ZV'])(
    'rejects %s with the last character changed',
    (gstin) => {
      expect(isValidGstin(withLastChanged(gstin))).toBe(false);
      expect(isValidGstin(gstin.slice(0, -1) + '0')).toBe(false);
    },
  );

  it('trims and uppercases before checking', () => {
    expect(isValidGstin('  36aabcu3675k1zy ')).toBe(true);
  });

  it('computes the documented check character', () => {
    expect(gstinCheckCharacter('36AABCU3675K1Z')).toBe('Y');
    expect(gstinCheckCharacter('37AABCU3675K2Z')).toBe('V');
    expect(gstinCheckCharacter('36AABCU3675K1Z!')).toBeNull();
  });

  it('rejects wrong format even when length is 15', () => {
    expect(isValidGstin('36AABCU3675K1AY')).toBe(false); // 14th character must be Z
    expect(isValidGstin('AAAABCU3675K1ZY')).toBe(false); // state digits missing
    expect(isValidGstin('36AABCU3675K0ZY')).toBe(false); // entity code cannot be 0
    expect(isValidGstin('')).toBe(false);
  });

  it('extracts the state code and PAN', () => {
    expect(stateCodeOfGstin('36AABCU3675K1ZY')).toBe('36');
    expect(panOfGstin('36AABCU3675K1ZY')).toBe('AABCU3675K');
  });
});

describe('other identifier validators', () => {
  it('PAN', () => {
    expect(isValidPan(' aabcu3675k ')).toBe(true);
    expect(isValidPan('AABCU3675')).toBe(false);
    expect(isValidPan('AABC13675K')).toBe(false);
  });

  it('TAN', () => {
    expect(isValidTan('hydu12345a')).toBe(true);
    expect(isValidTan('HYD12345A')).toBe(false);
  });

  it('CIN', () => {
    expect(isValidCin('U45200TG2015PTC123456')).toBe(true);
    expect(isValidCin('A45200TG2015PTC123456')).toBe(false);
    expect(isValidCin('U45200TG2015PTC12345')).toBe(false);
  });

  it('LLPIN', () => {
    expect(isValidLlpin('aab-1234')).toBe(true);
    expect(isValidLlpin('AAB1234')).toBe(false);
  });

  it('PIN code', () => {
    expect(isValidPinCode('500081')).toBe(true);
    expect(isValidPinCode('050081')).toBe(false);
    expect(isValidPinCode('50008')).toBe(false);
  });

  it('phone', () => {
    expect(isValidPhone('+919876543210')).toBe(true);
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('98765')).toBe(false);
    expect(isValidPhone('+1234567890123456')).toBe(false);
  });

  it('master code', () => {
    expect(isValidMasterCode('uie-01')).toBe(true);
    expect(isValidMasterCode('-UIE')).toBe(false);
    expect(isValidMasterCode('A'.repeat(21))).toBe(false);
    expect(isValidMasterCode('UIE 01')).toBe(false);
  });
});

describe('CreateCompanyRequest normalisation', () => {
  const base = { code: ' uie-1 ', legalName: ' Unique Infra ', entityType: 'COMPANY' };

  it('uppercases identifiers and turns blank optionals into null', () => {
    const parsed = CreateCompanyRequest.parse({
      ...base,
      pan: ' aabcu3675k ',
      tan: '',
      city: '  ',
    });

    expect(parsed).toMatchObject({
      code: 'UIE-1',
      legalName: 'Unique Infra',
      pan: 'AABCU3675K',
      tan: null,
      city: null,
      stateId: null,
      pinCode: null,
    });
  });

  it('rejects an invalid PAN and PIN code', () => {
    expect(CreateCompanyRequest.safeParse({ ...base, pan: 'BAD' }).success).toBe(false);
    expect(CreateCompanyRequest.safeParse({ ...base, pinCode: '012345' }).success).toBe(false);
  });
});
