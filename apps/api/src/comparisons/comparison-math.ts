import type {
  ComparisonGridLine,
  ComparisonOffer,
  ComparisonVendorColumn,
  EnquiryItemSummary,
} from '@uie/contracts';
import { formatScaled, toScaled } from '../quotations/quotation-math';

/** rate x (100 - discount) / 100, half-up to 4 decimals, GST excluded (OQ-62). */
export function netRateOf(rate: string, discountPercent: string): string {
  // rate 10^4 x (100 - discount)% 10^4 = 10^8; back to 10^4.
  const scaled = toScaled(rate, 4) * (10_000n - toScaled(discountPercent, 2));

  return formatScaled((scaled + 5_000n) / 10_000n, 4);
}

/** Rank = 1 + vendors with a lower net rate, so equal rates share a rank. Null stays null. */
export function ranksOf(netRates: readonly (string | null)[]): (number | null)[] {
  const values = netRates.map((value) => (value === null ? null : toScaled(value, 4)));

  return values.map((value) =>
    value === null ? null : 1 + values.filter((other) => other !== null && other < value).length,
  );
}

export interface GridQuotationLine {
  quotationLineId: string;
  enquiryLineId: string;
  isQuoted: boolean;
  rate: string | null;
  discountPercent: string | null;
  gstRate: string | null;
  taxableAmount: string | null;
  lineTotal: string | null;
  makeBrand: string | null;
}

export interface GridQuotation {
  quotationId: string;
  quotationLabel: string;
  vendor: { id: string; code: string; legalName: string };
  quoteDate: string;
  validUntil: string | null;
  deliveryDays: number | null;
  paymentTermsDays: number | null;
  subtotal: string;
  taxTotal: string;
  chargesTotal: string;
  grandTotal: string;
  lines: GridQuotationLine[];
}

export interface GridEnquiryLine {
  enquiryLineId: string;
  lineNo: number;
  item: EnquiryItemSummary;
  quantity: string;
}

export interface ComparisonGrid {
  vendors: ComparisonVendorColumn[];
  lines: ComparisonGridLine[];
}

function offerOf(vendorId: string, line: GridQuotationLine): Omit<ComparisonOffer, 'rank'> {
  const rate = line.isQuoted ? line.rate : null;

  if (rate === null) {
    return {
      vendorId,
      quotationLineId: line.quotationLineId,
      isQuoted: false,
      rate: null,
      discountPercent: null,
      netRate: null,
      gstRate: null,
      taxableAmount: null,
      lineTotal: null,
      makeBrand: line.makeBrand,
    };
  }

  const discount = line.discountPercent ?? '0';

  return {
    vendorId,
    quotationLineId: line.quotationLineId,
    isQuoted: true,
    rate,
    discountPercent: discount,
    netRate: netRateOf(rate, discount),
    gstRate: line.gstRate,
    taxableAmount: line.taxableAmount,
    lineTotal: line.lineTotal,
    makeBrand: line.makeBrand,
  };
}

/** Vendors sorted by code; one offer per vendor per line; expired = valid-until before the comparison date (OQ-64). */
export function buildGrid(
  enquiryLines: readonly GridEnquiryLine[],
  quotations: readonly GridQuotation[],
  comparisonDate: string,
): ComparisonGrid {
  const ordered = [...quotations].sort((a, b) => a.vendor.code.localeCompare(b.vendor.code));

  const vendors: ComparisonVendorColumn[] = ordered.map((quotation) => ({
    quotationId: quotation.quotationId,
    quotationLabel: quotation.quotationLabel,
    vendor: quotation.vendor,
    quoteDate: quotation.quoteDate,
    validUntil: quotation.validUntil,
    isExpired: quotation.validUntil !== null && quotation.validUntil < comparisonDate,
    deliveryDays: quotation.deliveryDays,
    paymentTermsDays: quotation.paymentTermsDays,
    subtotal: quotation.subtotal,
    taxTotal: quotation.taxTotal,
    chargesTotal: quotation.chargesTotal,
    grandTotal: quotation.grandTotal,
  }));

  const lines: ComparisonGridLine[] = [...enquiryLines]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((line) => {
      const raw = ordered.flatMap((quotation) => {
        const row = quotation.lines.find((entry) => entry.enquiryLineId === line.enquiryLineId);

        return row === undefined ? [] : [offerOf(quotation.vendor.id, row)];
      });
      const ranks = ranksOf(raw.map((offer) => offer.netRate));

      return {
        enquiryLineId: line.enquiryLineId,
        lineNo: line.lineNo,
        item: line.item,
        quantity: line.quantity,
        offers: raw.map((offer, index) => ({ ...offer, rank: ranks[index] ?? null })),
      };
    });

  return { vendors, lines };
}

export interface SelectionInput {
  enquiryLineId: string;
  selectedVendorId: string | null;
  reason: string | null;
}

export interface SelectionProblem {
  code: 'INVALID_LINES' | 'INVALID_SELECTION' | 'REASON_REQUIRED' | 'NOTHING_SELECTED';
  message: string;
}

/**
 * Draft save: one row per enquiry line, chosen vendor must have quoted the line.
 * Finalise adds: at least one line chosen, reason for every non-L1 choice (OQ-63).
 */
export function selectionProblem(
  grid: ComparisonGrid,
  inputs: readonly SelectionInput[],
  finalising: boolean,
): SelectionProblem | null {
  const byId = new Map(inputs.map((input) => [input.enquiryLineId, input]));

  if (
    inputs.length !== grid.lines.length ||
    grid.lines.some((line) => !byId.has(line.enquiryLineId))
  ) {
    return { code: 'INVALID_LINES', message: 'Send one row for every line of the enquiry.' };
  }

  let chosen = 0;

  for (const line of grid.lines) {
    const input = byId.get(line.enquiryLineId);

    if (input === undefined || input.selectedVendorId === null) {
      continue;
    }

    const offer = line.offers.find((entry) => entry.vendorId === input.selectedVendorId);

    if (offer === undefined || !offer.isQuoted) {
      return {
        code: 'INVALID_SELECTION',
        message: `Line ${line.lineNo}: the chosen vendor has not quoted this line.`,
      };
    }

    if (finalising && offer.rank !== 1 && input.reason === null) {
      return {
        code: 'REASON_REQUIRED',
        message: `Line ${line.lineNo}: give a reason for not choosing the lowest (L1) vendor.`,
      };
    }

    chosen += 1;
  }

  if (finalising && chosen === 0) {
    return { code: 'NOTHING_SELECTED', message: 'Choose a vendor for at least one line.' };
  }

  return null;
}
