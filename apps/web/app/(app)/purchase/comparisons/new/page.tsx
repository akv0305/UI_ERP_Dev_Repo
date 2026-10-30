import { ComparisonGridResponse } from '@uie/contracts';
import { z } from 'zod';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { firstValue, type SearchParams } from '@/lib/list-params';
import { EnquiryChooser } from '../_components/enquiry-chooser';
import { ComparisonForm } from '../comparison-form';

const t = terminology.comparisons;

export default async function NewComparisonPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await requirePermission('purchase.comparisons.manage'))) {
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

  const grid = await apiGet(
    `/api/comparisons/grid?enquiryId=${encodeURIComponent(enquiryId)}`,
    ComparisonGridResponse,
  );

  if (grid.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (grid.kind === 'notFound') {
    return <ErrorState description={t.enquiryNotFound} />;
  }

  if (grid.kind !== 'ok') {
    return <ErrorState description={t.gridUnavailable} />;
  }

  if (grid.data.vendors.length === 0) {
    return <ErrorState description={t.noQuotations} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.newTitle} subtitle={grid.data.enquiry.number} />
      <ComparisonForm grid={grid.data} />
    </div>
  );
}
