import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { getCurrentUser } from '@/lib/auth/session';
import { ChangePasswordForm } from './change-password-form';

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect('/login');
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={terminology.account.changePasswordTitle}
        subtitle={user.mustChangePassword ? terminology.account.changePasswordRequired : undefined}
      />
      <ChangePasswordForm />
    </div>
  );
}
