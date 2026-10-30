import {
  QUANTITY_PATTERN,
  QUOTATION_AMOUNT_PATTERN,
  QUOTATION_PERCENT_PATTERN,
  QUOTATION_RATE_PATTERN,
} from '@uie/contracts';

/** On-screen preview only; the API computes the saved totals with the same rules (PD-006). */

export interface TotalsLine {
  isQuoted: boolean;
  quantity: string;
  rate: string;
  discountPercent: string;
  gstRate: string;
}

export interface TotalsCharge {
  amount: string;
  gstRate: string;
}

export interface QuotationTotals {
  /** null when the line is not quoted or not yet valid. */
  lineTotals: (string | null)[];
  subtotal: string;
  taxTotal: string;
  chargesTotal: string;
  grandTotal: string;
}

function scaled(value: string, places: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');

  return BigInt(`${whole}${fraction.padEnd(places, '0').slice(0, places)}`);
}

function halfUp(numerator: bigint, divisor: bigint): bigint {
  return (numerator + divisor / 2n) / divisor;
}

function money(paise: bigint): string {
  const text = paise.toString().padStart(3, '0');

  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

function isPercent(value: string): boolean {
  return QUOTATION_PERCENT_PATTERN.test(value) && scaled(value, 2) <= 10_000n;
}

export function quotationTotals(
  lines: readonly TotalsLine[],
  charges: readonly TotalsCharge[],
): QuotationTotals {
  let subtotal = 0n;
  let taxTotal = 0n;
  let chargesTotal = 0n;

  const lineTotals = lines.map((line) => {
    const rate = line.rate.trim();
    const discount = line.discountPercent.trim() || '0';
    const gst = line.gstRate.trim();
    const quantity = line.quantity.trim();

    if (
      !line.isQuoted ||
      !QUOTATION_RATE_PATTERN.test(rate) ||
      !isPercent(discount) ||
      !isPercent(gst) ||
      !QUANTITY_PATTERN.test(quantity)
    ) {
      return null;
    }

    const taxable = halfUp(
      scaled(rate, 4) * scaled(quantity, 3) * (10_000n - scaled(discount, 2)),
      1_000_000_000n,
    );
    const tax = halfUp(taxable * scaled(gst, 2), 10_000n);

    subtotal += taxable;
    taxTotal += tax;

    return money(taxable + tax);
  });

  for (const charge of charges) {
    const amount = charge.amount.trim();
    const gst = charge.gstRate.trim();

    if (QUOTATION_AMOUNT_PATTERN.test(amount) && isPercent(gst)) {
      const base = scaled(amount, 2);

      chargesTotal += base + halfUp(base * scaled(gst, 2), 10_000n);
    }
  }

  return {
    lineTotals,
    subtotal: money(subtotal),
    taxTotal: money(taxTotal),
    chargesTotal: money(chargesTotal),
    grandTotal: money(subtotal + taxTotal + chargesTotal),
  };
}
