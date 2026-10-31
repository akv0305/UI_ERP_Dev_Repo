import type { PurchaseOrderChargeType, PurchaseOrderTaxType } from '@uie/contracts';
import { formatScaled, toScaled } from '../quotations/quotation-math';

/** DECIMAL(18,2) holds values below 10^16 rupees, i.e. below 10^18 paise. */
const MAX_PAISE = 1_000_000_000_000_000_000n;

/** Half-up division for non-negative values. */
function divideHalfUp(numerator: bigint, divisor: bigint): bigint {
  return (numerator + divisor / 2n) / divisor;
}

/**
 * OQ-71: same state as the billing registration = CGST + SGST, different = IGST,
 * no vendor GST registration (unregistered vendor) = no GST.
 */
export function taxTypeFor(
  billingStateId: string,
  vendorGstStateId: string | null,
): PurchaseOrderTaxType {
  if (vendorGstStateId === null) {
    return 'NONE';
  }

  return billingStateId === vendorGstStateId ? 'CGST_SGST' : 'IGST';
}

/** rate x qty x (100 - discount)%, in paise, half-up (PD-006). Inputs are pattern-checked strings. */
export function taxableOf(rate: string, quantity: string, discountPercent: string): bigint {
  // Scales: rate 10^4 x qty 10^3 x (100 - discount)% 10^4 = 10^11; paise = 10^2.
  const net = toScaled(rate, 4) * toScaled(quantity, 3) * (10_000n - toScaled(discountPercent, 2));

  return divideHalfUp(net, 1_000_000_000n);
}

export interface TaxSplit {
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
}

/**
 * GST on a taxable amount in paise. CGST and SGST are each half the rate, rounded half-up
 * separately, so they are always equal (DB CHECK on the totals).
 */
export function splitTax(
  taxable: bigint,
  gstRate: string,
  taxType: PurchaseOrderTaxType,
): TaxSplit {
  const rate = toScaled(gstRate, 2);

  if (taxType === 'NONE') {
    return { cgst: 0n, sgst: 0n, igst: 0n };
  }

  if (taxType === 'IGST') {
    return { cgst: 0n, sgst: 0n, igst: divideHalfUp(taxable * rate, 10_000n) };
  }

  const half = divideHalfUp(taxable * rate, 20_000n);

  return { cgst: half, sgst: half, igst: 0n };
}

export interface PurchaseOrderPricingLine {
  itemId: string;
  comparisonLineId: string | null;
  quantity: string;
  rate: string;
  discountPercent: string | null;
  gstRate: string;
  remarks: string | null;
}

export interface PurchaseOrderPricingCharge {
  chargeType: PurchaseOrderChargeType;
  description: string | null;
  amount: string;
  gstRate: string;
}

/** Row values for purchase_order_lines (decimals as strings). lineNo follows the request order. */
export interface PricedPurchaseOrderLine {
  lineNo: number;
  itemId: string;
  comparisonLineId: string | null;
  quantity: string;
  rate: string;
  discountPercent: string;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
  remarks: string | null;
}

export interface PricedPurchaseOrderCharge {
  chargeType: PurchaseOrderChargeType;
  description: string | null;
  amount: string;
  gstRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
}

export interface PricedPurchaseOrder {
  lines: PricedPurchaseOrderLine[];
  charges: PricedPurchaseOrderCharge[];
  subtotal: string;
  chargesAmount: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  taxTotal: string;
  grandTotal: string;
}

export type PurchaseOrderPricingResult =
  { problem: string; priced: null } | { problem: null; priced: PricedPurchaseOrder };

function problem(message: string): PurchaseOrderPricingResult {
  return { problem: message, priced: null };
}

/**
 * Prices every line and charge and adds up the totals exactly as the DB CHECKs require:
 * taxTotal = CGST + SGST + IGST; grandTotal = subtotal + charges + taxTotal.
 */
export function pricePurchaseOrder(
  lines: readonly PurchaseOrderPricingLine[],
  charges: readonly PurchaseOrderPricingCharge[],
  taxType: PurchaseOrderTaxType,
): PurchaseOrderPricingResult {
  const pricedLines: PricedPurchaseOrderLine[] = [];
  let subtotal = 0n;
  let cgstTotal = 0n;
  let sgstTotal = 0n;
  let igstTotal = 0n;

  for (const [index, line] of lines.entries()) {
    const lineNo = index + 1;
    const discount = line.discountPercent ?? '0';
    const taxable = taxableOf(line.rate, line.quantity, discount);
    const tax = splitTax(taxable, line.gstRate, taxType);
    const lineTotal = taxable + tax.cgst + tax.sgst + tax.igst;

    if (lineTotal >= MAX_PAISE) {
      return problem(`Line ${lineNo}: the amount is too large.`);
    }

    subtotal += taxable;
    cgstTotal += tax.cgst;
    sgstTotal += tax.sgst;
    igstTotal += tax.igst;
    pricedLines.push({
      lineNo,
      itemId: line.itemId,
      comparisonLineId: line.comparisonLineId,
      quantity: formatScaled(toScaled(line.quantity, 3), 3),
      rate: formatScaled(toScaled(line.rate, 4), 4),
      discountPercent: formatScaled(toScaled(discount, 2), 2),
      gstRate: formatScaled(toScaled(line.gstRate, 2), 2),
      taxableAmount: formatScaled(taxable, 2),
      cgstAmount: formatScaled(tax.cgst, 2),
      sgstAmount: formatScaled(tax.sgst, 2),
      igstAmount: formatScaled(tax.igst, 2),
      lineTotal: formatScaled(lineTotal, 2),
      remarks: line.remarks,
    });
  }

  let chargesAmount = 0n;
  const pricedCharges: PricedPurchaseOrderCharge[] = [];

  for (const charge of charges) {
    const amount = toScaled(charge.amount, 2);
    const tax = splitTax(amount, charge.gstRate, taxType);

    chargesAmount += amount;
    cgstTotal += tax.cgst;
    sgstTotal += tax.sgst;
    igstTotal += tax.igst;
    pricedCharges.push({
      chargeType: charge.chargeType,
      description: charge.description,
      amount: formatScaled(amount, 2),
      gstRate: formatScaled(toScaled(charge.gstRate, 2), 2),
      cgstAmount: formatScaled(tax.cgst, 2),
      sgstAmount: formatScaled(tax.sgst, 2),
      igstAmount: formatScaled(tax.igst, 2),
    });
  }

  const taxTotal = cgstTotal + sgstTotal + igstTotal;
  const grandTotal = subtotal + chargesAmount + taxTotal;

  if (grandTotal >= MAX_PAISE) {
    return problem('The purchase order total is too large.');
  }

  return {
    problem: null,
    priced: {
      lines: pricedLines,
      charges: pricedCharges,
      subtotal: formatScaled(subtotal, 2),
      chargesAmount: formatScaled(chargesAmount, 2),
      cgstTotal: formatScaled(cgstTotal, 2),
      sgstTotal: formatScaled(sgstTotal, 2),
      igstTotal: formatScaled(igstTotal, 2),
      taxTotal: formatScaled(taxTotal, 2),
      grandTotal: formatScaled(grandTotal, 2),
    },
  };
}
