'use client';

import { createChangePasswordFormSchema, type ChangePasswordFormValues } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FormLayout, TextField } from '@/components/erp';
import { terminology } from '@/config/terminology';
import * as toast from '@/lib/toast';

const DEFAULT_VALUES: ChangePasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export function ChangePasswordForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      createChangePasswordFormSchema({
        required: terminology.validation.required,
        tooShort: terminology.validation.passwordTooShort,
        needsLetter: terminology.validation.passwordNeedsLetter,
        needsDigit: terminology.validation.passwordNeedsDigit,
        mismatch: terminology.validation.passwordMismatch,
      }),
    [],
  );

  async function handleSubmit(values: ChangePasswordFormValues): Promise<void> {
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });

      if (response.ok) {
        toast.success(terminology.account.passwordChanged);
        router.replace('/home');
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;

      setErrorMessage(
        payload?.error?.code === 'INVALID_CURRENT_PASSWORD'
          ? terminology.account.invalidCurrentPassword
          : terminology.account.changePasswordError,
      );
    } catch {
      setErrorMessage(terminology.account.changePasswordError);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout schema={schema} defaultValues={DEFAULT_VALUES} onSubmit={handleSubmit}>
        <TextField<ChangePasswordFormValues>
          name="currentPassword"
          label={terminology.account.currentPassword}
          type="password"
          autoComplete="current-password"
          required
        />
        <TextField<ChangePasswordFormValues>
          name="newPassword"
          label={terminology.account.newPassword}
          description={terminology.account.passwordPolicy}
          type="password"
          autoComplete="new-password"
          required
        />
        <TextField<ChangePasswordFormValues>
          name="confirmPassword"
          label={terminology.account.confirmPassword}
          type="password"
          autoComplete="new-password"
          required
        />
      </FormLayout>
    </div>
  );
}
