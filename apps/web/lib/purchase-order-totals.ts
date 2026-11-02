import {
  QUANTITY_PATTERN,
  QUOTATION_AMOUNT_PATTERN,
  QUOTATION_PERCENT_PATTERN,
  QUOTATION_RATE_PATTERN,
  type PurchaseOrderTaxType,
} from '@uie/contracts';

/**
 * On-screen preview only. The API prices and saves with the same rules (OQ-71, PD-006):
 * taxable half-up to paisa; CGST and SGST each half the rate, rounded separately.
 */

export interface PoTotalsLine {
  quantity: string;
  rate: string;
  discountPercent: string;
  gstRate: string;
}

export interface PoTotalsCharge {
  amount: string;
  gstRate: string;
}

export interface PurchaseOrderTotals {
  /** null when the line is not yet valid. */
  lineTotals: (string | null)[];
  subtotal: string;
  chargesAmount: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  taxTotal: string;
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

function split(
  taxable: bigint,
  gst: bigint,
  taxType: PurchaseOrderTaxType,
): [bigint, bigint, bigint] {
  if (taxType === 'NONE') {
    return [0n, 0n, 0n];
  }

  if (taxType === 'IGST') {
    return [0n, 0n, halfUp(taxable * gst, 10_000n)];
  }

  const half = halfUp(taxable * gst, 20_000n);

  return [half, half, 0n];
}

export function purchaseOrderTotals(
  lines: readonly PoTotalsLine[],
  charges: readonly PoTotalsCharge[],
  taxType: PurchaseOrderTaxType,
): PurchaseOrderTotals {
  let subtotal = 0n;
  let chargesAmount = 0n;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;

  const lineTotals = lines.map((line) => {
    const quantity = line.quantity.trim();
    const rate = line.rate.trim();
    const discount = line.discountPercent.trim() || '0';
    const gst = line.gstRate.trim();

    if (
      !QUANTITY_PATTERN.test(quantity) ||
      !QUOTATION_RATE_PATTERN.test(rate) ||
      !isPercent(discount) ||
      !isPercent(gst)
    ) {
      return null;
    }

    const taxable = halfUp(
      scaled(rate, 4) * scaled(quantity, 3) * (10_000n - scaled(discount, 2)),
      1_000_000_000n,
    );
    const [c, s, i] = split(taxable, scaled(gst, 2), taxType);

    subtotal += taxable;
    cgst += c;
    sgst += s;
    igst += i;

    return money(taxable + c + s + i);
  });

  for (const charge of charges) {
    const amount = charge.amount.trim();
    const gst = charge.gstRate.trim();

    if (QUOTATION_AMOUNT_PATTERN.test(amount) && isPercent(gst)) {
      const base = scaled(amount, 2);
      const [c, s, i] = split(base, scaled(gst, 2), taxType);

      chargesAmount += base;
      cgst += c;
      sgst += s;
      igst += i;
    }
  }

  const taxTotal = cgst + sgst + igst;

  return {
    lineTotals,
    subtotal: money(subtotal),
    chargesAmount: money(chargesAmount),
    cgstTotal: money(cgst),
    sgstTotal: money(sgst),
    igstTotal: money(igst),
    taxTotal: money(taxTotal),
    grandTotal: money(subtotal + chargesAmount + taxTotal),
  };
}
