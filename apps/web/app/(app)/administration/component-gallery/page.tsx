import { PendingScreen } from '@/components/erp';
import { terminology } from '@/config/terminology';

export default function ComponentGalleryPage() {
  return (
    <PendingScreen
      title={terminology.nav.componentGallery}
      permission="administration.componentGallery.view"
    />
  );
}
