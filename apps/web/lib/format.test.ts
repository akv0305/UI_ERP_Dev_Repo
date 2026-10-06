import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatINR, formatQty } from './format';

describe('formatINR', () => {
  it('formats with the rupee symbol and Indian digit grouping', () => {
    expect(formatINR(1234567.89)).toBe('₹12,34,567.89');
  });

  it('formats thousands and zero with two fraction digits', () => {
    expect(formatINR(1000)).toBe('₹1,000.00');
    expect(formatINR(0)).toBe('₹0.00');
  });

  it('formats large amounts with Indian grouping', () => {
    expect(formatINR(12345678)).toBe('₹1,23,45,678.00');
  });

  it('formats negative amounts', () => {
    expect(formatINR(-1234.5)).toBe('-₹1,234.50');
  });
});

describe('formatQty', () => {
  it('formats with the requested number of decimals', () => {
    expect(formatQty(1234.5, 2)).toBe('1,234.50');
    expect(formatQty(0, 3)).toBe('0.000');
  });

  it('uses Indian digit grouping', () => {
    expect(formatQty(1234567.891, 2)).toBe('12,34,567.89');
  });
});

describe('formatDate', () => {
  it('formats as DD-MM-YYYY', () => {
    expect(formatDate('2026-10-06')).toBe('06-10-2026');
  });

  it('accepts Date instances', () => {
    expect(formatDate(new Date('2026-01-09T00:00:00+05:30'))).toBe('09-01-2026');
  });

  it('renders the date in the Asia/Kolkata time zone', () => {
    expect(formatDate(new Date('2026-10-05T20:00:00Z'))).toBe('06-10-2026');
  });
});

describe('formatDateTime', () => {
  it('formats as DD-MM-YYYY HH:mm:ss in Asia/Kolkata', () => {
    expect(formatDateTime('2026-10-06T13:04:05Z')).toBe('06-10-2026 18:34:05');
  });

  it('keeps midnight in the Asia/Kolkata time zone', () => {
    expect(formatDateTime(new Date('2026-01-09T00:00:00+05:30'))).toBe('09-01-2026 00:00:00');
  });
});
