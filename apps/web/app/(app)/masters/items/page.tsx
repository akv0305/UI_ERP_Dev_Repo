import { NotAuthorised, PageHeader, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';
import { ItemMasterTabs } from './_components/item-master-tabs';

export default async function ItemsPage() {
  if (!(await requirePermission('masters.items.view'))) {
    return <NotAuthorised />;
  }

  // The items list itself arrives in G-05a batch 3b.
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={terminology.nav.items} subtitle={terminology.itemMaster.subtitle} />
      <ItemMasterTabs />
      <PendingScreen title={terminology.itemMaster.tabItems} />
    </div>
  );
}
