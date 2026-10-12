import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/shell/brand-logo';
import { terminology } from '@/config/terminology';
import { theme } from '@/config/theme';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if ((await getCurrentUser()) !== null) {
    redirect('/home');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <BrandLogo variant="full" height={theme.layout.brandLogoHeightLogin} />
        <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h1 className="mb-6 text-lg font-semibold text-foreground">
            {terminology.login.heading}
          </h1>
          <LoginForm />
        </div>
        <p className="text-center text-sm text-muted-foreground">{theme.brand.appName}</p>
      </div>
    </main>
  );
}
