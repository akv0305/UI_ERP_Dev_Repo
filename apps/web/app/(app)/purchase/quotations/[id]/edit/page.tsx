import { QuotationDetailResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { quotationTitle } from '../../_components/quotation-text';
import { QuotationForm } from '../../quotation-form';

const t = terminology.quotations;

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('purchase.quotations.manage'))) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const quotation = await apiGet(
    `/api/quotations/${encodeURIComponent(id)}`,
    QuotationDetailResponse,
  );

  if (quotation.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (quotation.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (quotation.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.editTitle} subtitle={quotationTitle(quotation.data, t.unnumbered)} />
      {quotation.data.canEdit ? (
        <QuotationForm quotation={quotation.data} />
      ) : (
        <ErrorState description={t.lockedNotice} />
      )}
    </div>
  );
}
