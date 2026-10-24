import { IndentFormOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { IndentForm } from '../indent-form';

const t = terminology.indents;

export default async function NewIndentPage() {
  if (!(await requirePermission('purchase.indents.manage'))) {
    return <NotAuthorised />;
  }

  const options = await apiGet('/api/indents/form-options', IndentFormOptionsResponse);

  if (options.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.optionsUnavailable} />;
  }

  if (options.data.projects.length === 0) {
    return <ErrorState description={t.noProjects} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.newTitle} />
      <IndentForm options={options.data} />
    </div>
  );
}
