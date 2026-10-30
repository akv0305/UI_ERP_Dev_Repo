import { terminology } from '@/config/terminology';
import { messageForApiError } from '@/lib/api/client';
import { rateText } from '../../quotations/_components/quotation-text';

/** Display helpers for the comparison screens (kept out of JSX for react/jsx-no-literals). */

const t = terminology.comparisons;

export function comparisonTitle(comparison: { number: string | null }): string {
  return comparison.number ?? t.unnumbered;
}

export function rankText(rank: number): string {
  return `${t.rankPrefix}${rank}`;
}

export function chosenCount(selected: number, total: number): string {
  return `${selected} / ${total}`;
}

/** "Rate 125.50 · Disc. 5%" (discount left out when zero). */
export function offerDetail(rate: string, discountPercent: string | null): string {
  const base = `${t.rateShort} ${rateText(rate)}`;

  if (discountPercent === null || Number(discountPercent) === 0) {
    return base;
  }

  return `${base} · ${t.discountShort} ${discountPercent}${t.percentSuffix}`;
}

/** Comparison wording first; shared API messages otherwise (the same codes mean quotation errors there). */
/** Comparison wording first; shared API messages otherwise (the same codes mean quotation errors there). */
export function comparisonErrorMessage(code: string | undefined): string {
  const own = code === undefined ? undefined : (t.apiErrors as Record<string, string>)[code];

  return own ?? messageForApiError(code);
}
