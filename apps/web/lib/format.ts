export type DateInput = Date | string | number;

const KOLKATA_TIME_ZONE = 'Asia/Kolkata';

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

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(value);
}

export function formatQty(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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
