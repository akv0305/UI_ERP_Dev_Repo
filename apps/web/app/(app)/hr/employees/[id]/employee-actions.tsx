'use client';

import type { EmployeeResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { StatusToggle } from '@/app/(app)/masters/_components/status-toggle';

/** Deactivate only for records created by mistake; a leaver gets a date of leaving (OQ-134). */
export function EmployeeActions({ employee }: { employee: EmployeeResponse }) {
  const router = useRouter();

  return (
    <StatusToggle
      isActive={employee.isActive}
      path={`/api/employees/${employee.id}`}
      labels={terminology.employees}
      onChanged={router.refresh}
    />
  );
}
