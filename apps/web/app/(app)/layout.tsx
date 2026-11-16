import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { changeContext, signOut } from '@/lib/auth/actions';
import { getContextOptions } from '@/lib/auth/context-options';
import { getCurrentUser } from '@/lib/auth/session';
import { UnreadNotificationCountResponse } from '@uie/contracts';
import { apiGet } from '@/lib/api/server';

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
  // Page load only, incl. router.refresh() after an action (OQ-129).
  const unread = await apiGet('/api/notifications/unread-count', UnreadNotificationCountResponse);
  const notificationCount = unread.kind === 'ok' ? unread.data.unreadCount : 0;

  return (
    <AppShell
      permissions={user.permissions}
      displayName={user.displayName}
      onSignOut={signOut}
      contextOptions={contextOptions}
      context={user.context}
      onChangeContext={changeContext}
      notificationCount={notificationCount}
    >
      {children}
    </AppShell>
  );
}
