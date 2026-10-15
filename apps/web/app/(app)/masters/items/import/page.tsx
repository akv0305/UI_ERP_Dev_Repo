import { ItemCategoryOptionsResponse, ItemUnitOptionsResponse } from '@uie/contracts';
import { ErrorState, NotAuthorised } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { ItemImportClient } from './item-import-client';

export default async function ItemImportPage() {
  if (!(await requirePermission('masters.items.manage'))) {
    return <NotAuthorised />;
  }

  // Option endpoints return active categories and units only: the only valid picks.
  const [categories, units] = await Promise.all([
    apiGet('/api/item-categories/options', ItemCategoryOptionsResponse),
    apiGet('/api/units/options', ItemUnitOptionsResponse),
  ]);

  if (categories.kind !== 'ok' || units.kind !== 'ok') {
    return <ErrorState description={terminology.items.optionsUnavailable} />;
  }

  return (
    <ItemImportClient
      categoryOptions={categories.data.items.map((c) => ({ value: c.id, label: c.label }))}
      unitOptions={units.data.items.map((u) => ({ value: u.id, label: u.label }))}
    />
  );
}
