export type DateInput = Date | string | number;
export type NumericInput = number | string;

const KOLKATA_TIME_ZONE = 'Asia/Kolkata';

const DECIMAL_STRING_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/;
const INDIAN_GROUP_PATTERN = /\B(?=(\d{2})+(?!\d))/g;

interface DecimalParts {
  negative: boolean;
  integerDigits: string;
  fractionDigits: string;
}

interface RoundedDecimal {
  integer: string;
  fraction: string;
}

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const record: Record<string, string> = {};

  for (const part of parts) {
    record[part.type] = part.value;
  }

  return record;
}

function groupIndianDigits(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }

  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);

  return `${rest.replace(INDIAN_GROUP_PATTERN, ',')},${lastThree}`;
}

function parseDecimalString(value: string): DecimalParts | null {
  const normalized = value.trim().replace(/,/g, '');
  const match = DECIMAL_STRING_PATTERN.exec(normalized);

  if (match === null) {
    return null;
  }

  const sign = match[1] ?? '';
  const integer = match[2] ?? '';
  const fraction = match[3] ?? '';

  if (integer.length === 0 && fraction.length === 0) {
    return null;
  }

  return {
    negative: sign === '-',
    integerDigits: integer.length > 0 ? integer : '0',
    fractionDigits: fraction,
  };
}

function roundDecimalString(parts: DecimalParts, decimals: number): RoundedDecimal {
  const digits = `${parts.integerDigits}${parts.fractionDigits}`;
  const scale = parts.fractionDigits.length;
  let scaled: bigint;

  if (scale <= decimals) {
    scaled = BigInt(digits) * 10n ** BigInt(decimals - scale);
  } else {
    const divisor = 10n ** BigInt(scale - decimals);
    const quotient = BigInt(digits) / divisor;
    const remainder = BigInt(digits) % divisor;
    scaled = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }

  const factor = 10n ** BigInt(decimals);
  const integer = (scaled / factor).toString();
  const fraction = decimals === 0 ? '' : (scaled % factor).toString().padStart(decimals, '0');

  return { integer, fraction };
}

function formatDecimalString(
  value: string,
  decimals: number,
): { negative: boolean; text: string } | null {
  const parts = parseDecimalString(value);

  if (parts === null) {
    return null;
  }

  const rounded = roundDecimalString(parts, decimals);
  const grouped = groupIndianDigits(rounded.integer);
  const text = rounded.fraction.length > 0 ? `${grouped}.${rounded.fraction}` : grouped;

  return { negative: parts.negative, text };
}

export function formatINR(value: NumericInput): string {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value);
  }

  const formatted = formatDecimalString(value, 2);

  if (formatted === null) {
    return '₹NaN';
  }

  return formatted.negative ? `-₹${formatted.text}` : `₹${formatted.text}`;
}

export function formatQty(value: NumericInput, decimals: number): string {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  const formatted = formatDecimalString(value, decimals);

  if (formatted === null) {
    return 'NaN';
  }

  return formatted.negative ? `-${formatted.text}` : formatted.text;
}

export function formatDate(value: DateInput): string {
  const parts = partsToRecord(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: KOLKATA_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(toDate(value)),
  );

  return `${parts.day}-${parts.month}-${parts.year}`;
}

export function formatDateTime(value: DateInput): string {
  const parts = partsToRecord(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: KOLKATA_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(toDate(value)),
  );

  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}
