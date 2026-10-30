import { quotationNumberLabel } from '@uie/contracts';
import { formatDateTime, formatQty } from '@/lib/format';

/** Display helpers for the quotation screens (kept out of JSX for react/jsx-no-literals). */

export function quotationTitle(
  quotation: { number: string | null; revisionNo: number },
  unnumbered: string,
): string {
  return quotation.number === null
    ? unnumbered
    : quotationNumberLabel(quotation.number, quotation.revisionNo);
}

export function revisionText(revisionNo: number, original: string): string {
  return revisionNo === 0 ? original : `R${revisionNo}`;
}

export function quotedCount(quoted: number, total: number): string {
  return `${quoted} / ${total}`;
}

export function daysText(days: number | null, suffix: string, notSet: string): string {
  return days === null ? notSet : `${days} ${suffix}`;
}

/** Rate with at least 2 decimals, trailing zeros beyond that dropped: "125.5000" -> "125.50". */
export function rateText(rate: string): string {
  const [whole = '0', fraction = ''] = rate.split('.');
  const kept = fraction.replace(/0+$/, '').padEnd(2, '0');

  return formatQty(`${whole}.${kept}`, kept.length);
}

export function actorLine(
  actor: { displayName: string } | null,
  at: string | null,
  notSet: string,
): string {
  if (at === null) {
    return notSet;
  }

  return actor === null ? formatDateTime(at) : `${actor.displayName}, ${formatDateTime(at)}`;
}
