'use client';

import type { EnquiryVendorResponse } from '@uie/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';
import { codeName, enquiryHref, vendorHref } from './print-text';

const t = terminology.enquiries;

/** Vendor picker, Print and Back; hidden on paper. */
export function PrintToolbar({
  enquiryId,
  vendors,
  vendorId,
}: {
  enquiryId: string;
  vendors: EnquiryVendorResponse[];
  vendorId: string;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-(--card-padding) print:hidden">
      <div className="flex min-w-72 flex-col gap-1">
        <Label htmlFor="print-vendor">{t.printVendorLabel}</Label>
        <select
          id="print-vendor"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={vendorId}
          onChange={(event) => router.replace(vendorHref(enquiryId, event.target.value))}
        >
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {codeName(vendor.code, vendor.legalName)}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={() => window.print()}>
        {t.printButton}
      </Button>
      <Button asChild variant="outline">
        <Link href={enquiryHref(enquiryId)}>{t.printBack}</Link>
      </Button>
      <p className="w-full text-xs text-muted-foreground">{t.printHint}</p>
    </div>
  );
}
