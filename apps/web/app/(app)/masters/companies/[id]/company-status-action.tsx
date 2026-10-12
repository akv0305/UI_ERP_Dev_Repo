'use client';

import type { CompanyDetailResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { StatusToggle } from '../../_components/status-toggle';

export function CompanyStatusAction({ company }: { company: CompanyDetailResponse }) {
  const router = useRouter();

  return (
    <StatusToggle
      isActive={company.isActive}
      path={`/api/companies/${company.id}`}
      labels={terminology.companies}
      onChanged={router.refresh}
    />
  );
}
