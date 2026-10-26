import { EnquiryFormOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { EnquiryForm } from '../enquiry-form';

const t = terminology.enquiries;

export default async function NewEnquiryPage() {
  if (!(await requirePermission('purchase.enquiries.manage'))) {
    return <NotAuthorised />;
  }

  const options = await apiGet('/api/enquiries/form-options', EnquiryFormOptionsResponse);

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
      <EnquiryForm options={options.data} />
    </div>
  );
}
