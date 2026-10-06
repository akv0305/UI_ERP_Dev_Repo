import { NotAuthorised, PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { requirePermission } from '@/lib/auth/require-permission';

export default function ComponentGalleryPage() {
  if (!requirePermission('administration.componentGallery.view')) {
    return <NotAuthorised />;
  }

  return <PendingScreen title={terminology.nav.componentGallery} />;
}
