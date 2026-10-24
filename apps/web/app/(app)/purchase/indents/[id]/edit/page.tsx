import { IndentDetailResponse, IndentFormOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { IndentForm } from '../../indent-form';

const t = terminology.indents;

export default async function EditIndentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('purchase.indents.manage'))) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const [indent, options] = await Promise.all([
    apiGet(`/api/indents/${id}`, IndentDetailResponse),
    apiGet('/api/indents/form-options', IndentFormOptionsResponse),
  ]);

  if (indent.kind === 'forbidden' || options.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (indent.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (indent.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.editTitle} subtitle={indent.data.number ?? t.unnumbered} />
      {indent.data.canEdit ? (
        <IndentForm indent={indent.data} options={options.data} />
      ) : (
        <ErrorState description={t.lockedNotice} />
      )}
    </div>
  );
}
