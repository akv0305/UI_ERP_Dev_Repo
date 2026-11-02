import type {
  PurchaseOrderLineReference,
  PurchaseOrderLineResponse,
  PurchaseOrderTermResponse,
} from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { formatQty } from '@/lib/format';
import { rateText } from '../../quotations/_components/quotation-text';

/** Display helpers for the purchase order screens (kept out of JSX for react/jsx-no-literals). */

const t = terminology.purchaseOrders;

export function purchaseOrderTitle(purchaseOrder: { number: string | null }): string {
  return purchaseOrder.number ?? t.unnumbered;
}

export function percentText(value: string): string {
  return `${value}${t.percentSuffix}`;
}

export function termText(term: PurchaseOrderTermResponse): string {
  if (term.title === null) {
    return term.text ?? '';
  }

  return term.text === null ? term.title : `${term.title}${t.termSeparator}${term.text}`;
}

/**
 * The comparison values that differ from the PO line (OQ-69, OQ-77).
 * Number() only compares for display; amounts are calculated by the API (PD-006).
 */
export function differenceHint(
  reference: PurchaseOrderLineReference | null,
  line: { quantity: string; rate: string; discountPercent: string; gstRate: string },
  decimalPlaces: number,
): string | null {
  if (reference === null) {
    return null;
  }

  const parts: string[] = [];

  if (Number(reference.enquiryQuantity) !== Number(line.quantity)) {
    parts.push(`${t.hintEnquiryQty} ${formatQty(reference.enquiryQuantity, decimalPlaces)}`);
  }

  if (Number(reference.quotedRate) !== Number(line.rate)) {
    parts.push(`${t.hintQuotedRate} ${rateText(reference.quotedRate)}`);
  }

  if (Number(reference.quotedDiscountPercent) !== Number(line.discountPercent)) {
    parts.push(`${t.hintQuotedDiscount} ${percentText(reference.quotedDiscountPercent)}`);
  }

  if (Number(reference.quotedGstRate) !== Number(line.gstRate)) {
    parts.push(`${t.hintQuotedGst} ${percentText(reference.quotedGstRate)}`);
  }

  return parts.length === 0 ? null : parts.join(t.hintSeparator);
}

export function referenceHint(line: PurchaseOrderLineResponse): string | null {
  return differenceHint(line.reference, line, line.item.decimalPlaces);
}

export function gstOptionLabel(registration: { gstin: string; state: string }): string {
  return `${registration.gstin}${t.hintSeparator}${registration.state}`;
}

export function contactLabel(contact: { name: string; phone: string | null }): string {
  return contact.phone === null
    ? contact.name
    : `${contact.name}${t.hintSeparator}${contact.phone}`;
}

export function lineError(index: number, message: string): string {
  return `${t.linePrefix} ${index + 1}: ${message}`;
}
