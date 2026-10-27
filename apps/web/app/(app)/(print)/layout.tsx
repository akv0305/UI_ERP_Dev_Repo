import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Signed-in pages without the app shell, for printing. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (user === null) {
    redirect('/login');
  }

  if (user.mustChangePassword) {
    redirect('/account/change-password');
  }

  return <div className="min-h-dvh bg-background print:bg-surface">{children}</div>;
}
