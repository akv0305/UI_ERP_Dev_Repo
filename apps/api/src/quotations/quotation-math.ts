import type { QuotationChargeType } from '@uie/contracts';

/** DECIMAL(18,2) holds values below 10^16 rupees, i.e. below 10^18 paise. */
const MAX_PAISE = 1_000_000_000_000_000_000n;

/** "125.5" with 4 places -> 1255000n. Inputs are already pattern-checked (digits, optional fraction). */
export function toScaled(value: string, places: number): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');

  return BigInt(`${whole}${fraction.padEnd(places, '0').slice(0, places)}`);
}

/** 5n with 2 places -> "0.05". */
export function formatScaled(value: bigint, places: number): string {
  const text = value.toString().padStart(places + 1, '0');

  return places === 0 ? text : `${text.slice(0, -places)}.${text.slice(-places)}`;
}

/** Half-up division for non-negative values. */
function divideHalfUp(numerator: bigint, divisor: bigint): bigint {
  return (numerator + divisor / 2n) / divisor;
}

/**
 * One quoted line in paise (PD-006): taxable = rate x qty x (100 - discount)% rounded half-up,
 * GST = taxable x GST% rounded half-up. No floats.
 */
export function lineAmounts(
  rate: string,
  quantity: string,
  discountPercent: string,
  gstRate: string,
): { taxable: bigint; tax: bigint } {
  // Scales: rate 10^4 x qty 10^3 x (100 - discount)% 10^4 = 10^11; paise = 10^2.
  const net = toScaled(rate, 4) * toScaled(quantity, 3) * (10_000n - toScaled(discountPercent, 2));
  const taxable = divideHalfUp(net, 1_000_000_000n);
  const tax = divideHalfUp(taxable * toScaled(gstRate, 2), 10_000n);

  return { taxable, tax };
}

/** GST on a header charge, in paise. */
export function chargeTax(amount: string, gstRate: string): bigint {
  return divideHalfUp(toScaled(amount, 2) * toScaled(gstRate, 2), 10_000n);
}

/** What the API knows about an enquiry line when it is quoted. */
export interface EnquiryLineForQuotation {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string;
  /** 3 decimals. */
  quantity: string;
  /** Item approved and active (OQ-27). */
  itemUsable: boolean;
}

export interface PricingLineInput {
  enquiryLineId: string;
  isQuoted: boolean;
  rate: string | null;
  discountPercent: string | null;
  gstRate: string | null;
  makeBrand: string | null;
  remarks: string | null;
}

export interface PricingChargeInput {
  chargeType: QuotationChargeType;
  description: string | null;
  amount: string;
  gstRate: string;
}

/** Row values for quotation_lines (decimals as strings). */
export interface PricedLine {
  lineNo: number;
  enquiryLineId: string;
  itemId: string;
  quantity: string;
  isQuoted: boolean;
  rate: string | null;
  discountPercent: string | null;
  gstRate: string | null;
  taxableAmount: string | null;
  taxAmount: string | null;
  lineTotal: string | null;
  makeBrand: string | null;
  remarks: string | null;
}

export interface PricedCharge {
  chargeType: QuotationChargeType;
  description: string | null;
  amount: string;
  gstRate: string;
  taxAmount: string;
}

export interface PricedQuotation {
  lines: PricedLine[];
  charges: PricedCharge[];
  subtotal: string;
  taxTotal: string;
  chargesTotal: string;
  grandTotal: string;
}

export type PricingResult =
  { problem: string; priced: null } | { problem: null; priced: PricedQuotation };

function problem(message: string): PricingResult {
  return { problem: message, priced: null };
}

/**
 * Checks one row per enquiry line, prices quoted lines and charges, and adds up the totals
 * (grand total = subtotal + GST + charges incl. their GST, as the DB CHECK requires).
 */
export function priceQuotation(
  enquiryLines: readonly EnquiryLineForQuotation[],
  lines: readonly PricingLineInput[],
  charges: readonly PricingChargeInput[],
): PricingResult {
  const byId = new Map(lines.map((line) => [line.enquiryLineId, line]));

  if (lines.length !== enquiryLines.length || enquiryLines.some((line) => !byId.has(line.id))) {
    return problem('Send one row for every line of the enquiry.');
  }

  const ordered = [...enquiryLines].sort((a, b) => a.lineNo - b.lineNo);
  const pricedLines: PricedLine[] = [];
  let subtotal = 0n;
  let taxTotal = 0n;

  for (const enquiryLine of ordered) {
    const input = byId.get(enquiryLine.id);

    if (input === undefined) {
      return problem('Send one row for every line of the enquiry.');
    }

    const base = {
      lineNo: enquiryLine.lineNo,
      enquiryLineId: enquiryLine.id,
      itemId: enquiryLine.itemId,
      quantity: enquiryLine.quantity,
      makeBrand: input.makeBrand,
      remarks: input.remarks,
    };

    if (!input.isQuoted) {
      pricedLines.push({
        ...base,
        isQuoted: false,
        rate: null,
        discountPercent: null,
        gstRate: null,
        taxableAmount: null,
        taxAmount: null,
        lineTotal: null,
      });
      continue;
    }

    if (!enquiryLine.itemUsable) {
      return problem(
        `Line ${enquiryLine.lineNo}: item ${enquiryLine.itemCode} is no longer approved or active.`,
      );
    }

    if (input.rate === null || input.gstRate === null) {
      return problem(`Line ${enquiryLine.lineNo}: enter the rate and GST %.`);
    }

    const discount = input.discountPercent ?? '0';
    const { taxable, tax } = lineAmounts(input.rate, enquiryLine.quantity, discount, input.gstRate);

    if (taxable + tax >= MAX_PAISE) {
      return problem(`Line ${enquiryLine.lineNo}: the amount is too large.`);
    }

    subtotal += taxable;
    taxTotal += tax;
    pricedLines.push({
      ...base,
      isQuoted: true,
      rate: formatScaled(toScaled(input.rate, 4), 4),
      discountPercent: formatScaled(toScaled(discount, 2), 2),
      gstRate: formatScaled(toScaled(input.gstRate, 2), 2),
      taxableAmount: formatScaled(taxable, 2),
      taxAmount: formatScaled(tax, 2),
      lineTotal: formatScaled(taxable + tax, 2),
    });
  }

  if (!pricedLines.some((line) => line.isQuoted)) {
    return problem('Quote at least one line.');
  }

  let chargesTotal = 0n;
  const pricedCharges = charges.map((charge) => {
    const tax = chargeTax(charge.amount, charge.gstRate);

    chargesTotal += toScaled(charge.amount, 2) + tax;

    return {
      chargeType: charge.chargeType,
      description: charge.description,
      amount: formatScaled(toScaled(charge.amount, 2), 2),
      gstRate: formatScaled(toScaled(charge.gstRate, 2), 2),
      taxAmount: formatScaled(tax, 2),
    };
  });
  const grandTotal = subtotal + taxTotal + chargesTotal;

  if (grandTotal >= MAX_PAISE) {
    return problem('The quotation total is too large.');
  }

  return {
    problem: null,
    priced: {
      lines: pricedLines,
      charges: pricedCharges,
      subtotal: formatScaled(subtotal, 2),
      taxTotal: formatScaled(taxTotal, 2),
      chargesTotal: formatScaled(chargesTotal, 2),
      grandTotal: formatScaled(grandTotal, 2),
    },
  };
}
