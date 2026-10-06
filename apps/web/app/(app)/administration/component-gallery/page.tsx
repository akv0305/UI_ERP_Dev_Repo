import { NotAuthorised } from '@/components/erp';
import { requirePermission } from '@/lib/auth/require-permission';
import { GalleryClient } from './gallery-client';

export default function ComponentGalleryPage() {
  if (!requirePermission('administration.componentGallery.view')) {
    return <NotAuthorised />;
  }

  return <GalleryClient />;
}
