import { StateListResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { VendorForm } from '../vendor-form';

export default async function NewVendorPage() {
  if (!(await requirePermission('masters.vendors.manage'))) {
    return <NotAuthorised />;
  }

  const states = await apiGet('/api/states', StateListResponse);

  if (states.kind !== 'ok') {
    return <ErrorState description={terminology.vendors.statesUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.vendors.newTitle} />
      <VendorForm states={states.data.items} />
    </div>
  );
}
