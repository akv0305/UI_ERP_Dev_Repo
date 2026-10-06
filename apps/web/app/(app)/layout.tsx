import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getCurrentPermissions } from '@/lib/auth/permissions';

export default function AppLayout({ children }: { children: ReactNode }) {
  const permissions = getCurrentPermissions();

  return (
    <AppShell permissions={permissions} companies={[]} projects={[]} notificationCount={0}>
      {children}
    </AppShell>
  );
}
