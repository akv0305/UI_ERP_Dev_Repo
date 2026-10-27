import { EnquiryDetailResponse, EnquiryPrintResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { EnquiryPrintDocument } from './enquiry-print-document';
import { PrintToolbar } from './print-toolbar';

const t = terminology.enquiries;

export default async function EnquiryPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendor?: string | string[] }>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.enquiries.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const { vendor } = await searchParams;
  const path = `/api/enquiries/${encodeURIComponent(id)}`;
  const detail = await apiGet(path, EnquiryDetailResponse);

  if (detail.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (detail.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (detail.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const enquiry = detail.data;

  if (enquiry.status !== 'SENT' && enquiry.status !== 'CLOSED') {
    return <ErrorState description={t.printUnavailable} />;
  }

  const requested = typeof vendor === 'string' ? vendor : undefined;
  const chosen = enquiry.vendors.find((row) => row.id === requested) ?? enquiry.vendors[0];

  if (chosen === undefined) {
    return <ErrorState description={t.printLoadError} />;
  }

  const copy = await apiGet(
    `${path}/print?vendorId=${encodeURIComponent(chosen.id)}`,
    EnquiryPrintResponse,
  );

  if (copy.kind !== 'ok') {
    return <ErrorState description={t.printLoadError} />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6 print:max-w-none print:p-0">
      <PrintToolbar enquiryId={enquiry.id} vendors={enquiry.vendors} vendorId={chosen.id} />
      <EnquiryPrintDocument copy={copy.data} />
    </div>
  );
}
