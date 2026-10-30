import { QuotationEnquiryFormResponse } from '@uie/contracts';
import { z } from 'zod';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { firstValue, type SearchParams } from '@/lib/list-params';
import { EnquiryChooser } from '../_components/enquiry-chooser';
import { QuotationForm } from '../quotation-form';

const t = terminology.quotations;

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await requirePermission('purchase.quotations.manage'))) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const enquiryId = firstValue(raw.enquiryId) ?? '';

  if (!z.uuid().safeParse(enquiryId).success) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t.newTitle} subtitle={t.chooseEnquiryHint} />
        <EnquiryChooser />
      </div>
    );
  }

  const form = await apiGet(
    `/api/quotations/enquiries/${encodeURIComponent(enquiryId)}/form`,
    QuotationEnquiryFormResponse,
  );

  if (form.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (form.kind === 'notFound') {
    return <ErrorState description={t.enquiryNotFound} />;
  }

  if (form.kind !== 'ok') {
    return <ErrorState description={t.formUnavailable} />;
  }

  if (!form.data.vendors.some((vendor) => !vendor.hasQuotation)) {
    return <ErrorState description={t.noVendorsLeft} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.newTitle} subtitle={form.data.enquiry.number} />
      <QuotationForm enquiryForm={form.data} />
    </div>
  );
}
