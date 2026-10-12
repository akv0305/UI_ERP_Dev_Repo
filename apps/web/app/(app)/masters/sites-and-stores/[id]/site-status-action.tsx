'use client';

import type { SiteResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { StatusToggle } from '../../_components/status-toggle';

export function SiteStatusAction({ site }: { site: SiteResponse }) {
  const router = useRouter();

  return (
    <StatusToggle
      isActive={site.isActive}
      path={`/api/sites/${site.id}`}
      labels={terminology.sites}
      onChanged={router.refresh}
    />
  );
}
