import { ComparisonDetailResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { comparisonTitle } from '../../_components/comparison-text';
import { ComparisonForm } from '../../comparison-form';

const t = terminology.comparisons;

export default async function EditComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('purchase.comparisons.manage'))) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const comparison = await apiGet(
    `/api/comparisons/${encodeURIComponent(id)}`,
    ComparisonDetailResponse,
  );

  if (comparison.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (comparison.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (comparison.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.editTitle} subtitle={comparisonTitle(comparison.data)} />
      {comparison.data.canEdit ? (
        <ComparisonForm comparison={comparison.data} />
      ) : (
        <ErrorState description={t.lockedNotice} />
      )}
    </div>
  );
}
