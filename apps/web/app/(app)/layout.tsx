import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { changeContext, signOut } from '@/lib/auth/actions';
import { getContextOptions } from '@/lib/auth/context-options';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (user === null) {
    redirect('/login');
  }

  if (user.mustChangePassword) {
    redirect('/account/change-password');
  }

  const contextOptions = await getContextOptions();

  return (
    <AppShell
      permissions={user.permissions}
      displayName={user.displayName}
      onSignOut={signOut}
      contextOptions={contextOptions}
      context={user.context}
      onChangeContext={changeContext}
      notificationCount={0}
    >
      {children}
    </AppShell>
  );
}
