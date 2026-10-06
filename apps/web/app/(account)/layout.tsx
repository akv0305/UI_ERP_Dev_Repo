import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { signOut } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (user === null) {
    redirect('/login');
  }

  if (user.mustChangePassword) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">{children}</div>
      </main>
    );
  }

  return (
    <AppShell
      permissions={user.permissions}
      displayName={user.displayName}
      onSignOut={signOut}
      companies={[]}
      projects={[]}
      notificationCount={0}
    >
      <div className="max-w-md">{children}</div>
    </AppShell>
  );
}
