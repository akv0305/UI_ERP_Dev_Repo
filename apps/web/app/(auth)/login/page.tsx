import { redirect } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if ((await getCurrentUser()) !== null) {
    redirect('/home');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-6 text-lg font-semibold text-foreground">{terminology.login.heading}</h1>
        <LoginForm />
      </div>
    </main>
  );
}
