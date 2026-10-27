import type { EnquiryPrintAddress } from '@uie/contracts';

/** Text helpers for the printed copy (kept out of JSX for react/jsx-no-literals). */

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

export function codeName(code: string, name: string): string {
  return `${code}  ${name}`;
}

export function itemDescription(item: { description: string; size: string | null }): string {
  return item.size === null ? item.description : `${item.description}, ${item.size}`;
}

/** "Line 1", "Line 2", "City - 500001", "36 Telangana" (blank parts dropped). */
export function addressLines(address: EnquiryPrintAddress): string[] {
  const cityLine = [address.city, address.pinCode].filter(present).join(' - ');

  return [address.line1, address.line2, cityLine, address.state].filter(present);
}

export function labelled(label: string, value: string | null): string | null {
  return present(value) ? `${label}: ${value}` : null;
}

export function joinPresent(parts: (string | null)[]): string {
  return parts.filter(present).join('    ');
}

export function requestSentence(text: string, date: string): string {
  return `${text} ${date}.`;
}

export function forCompany(prefix: string, legalName: string): string {
  return `${prefix} ${legalName}`;
}

export function vendorHref(enquiryId: string, vendorId: string): string {
  return `/print/enquiries/${enquiryId}?vendor=${encodeURIComponent(vendorId)}`;
}

export function enquiryHref(enquiryId: string): string {
  return `/purchase/enquiries/${enquiryId}`;
}
