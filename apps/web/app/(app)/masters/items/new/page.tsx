import { ItemCategoryOptionsResponse, ItemUnitOptionsResponse } from '@uie/contracts';
import { EmptyState, ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { ItemForm } from '../item-form';

export default async function NewItemPage() {
  if (!(await requirePermission('masters.items.manage'))) {
    return <NotAuthorised />;
  }

  // Option endpoints return active categories and units only.
  const [categories, units] = await Promise.all([
    apiGet('/api/item-categories/options', ItemCategoryOptionsResponse),
    apiGet('/api/units/options', ItemUnitOptionsResponse),
  ]);

  if (categories.kind !== 'ok' || units.kind !== 'ok') {
    return <ErrorState description={terminology.items.optionsUnavailable} />;
  }

  if (categories.data.items.length === 0 || units.data.items.length === 0) {
    return <EmptyState title={terminology.items.noOptions} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.items.newTitle} />
      <ItemForm
        categoryOptions={categories.data.items.map((c) => ({ value: c.id, label: c.label }))}
        unitOptions={units.data.items.map((u) => ({ value: u.id, label: u.label }))}
      />
    </div>
  );
}
