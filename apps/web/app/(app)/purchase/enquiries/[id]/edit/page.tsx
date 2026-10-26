import { EnquiryDetailResponse, EnquiryFormOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { EnquiryForm } from '../../enquiry-form';

const t = terminology.enquiries;

export default async function EditEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('purchase.enquiries.manage'))) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const [enquiry, options] = await Promise.all([
    apiGet(`/api/enquiries/${encodeURIComponent(id)}`, EnquiryDetailResponse),
    apiGet('/api/enquiries/form-options', EnquiryFormOptionsResponse),
  ]);

  if (enquiry.kind === 'forbidden' || options.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (enquiry.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (enquiry.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.editTitle} subtitle={enquiry.data.number ?? t.unnumbered} />
      {enquiry.data.canEdit ? (
        <EnquiryForm enquiry={enquiry.data} options={options.data} />
      ) : (
        <ErrorState description={t.lockedNotice} />
      )}
    </div>
  );
}
