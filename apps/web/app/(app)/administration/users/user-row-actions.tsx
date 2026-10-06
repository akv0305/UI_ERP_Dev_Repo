'use client';

import { PasswordPolicy, type UserResponse } from '@uie/contracts';
import { KeyRound, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

export interface UserRowActionsProps {
  user: UserResponse;
  onChanged: () => void;
}

function isLocked(user: UserResponse): boolean {
  return (
    (user.lockedUntil !== null && new Date(user.lockedUntil) > new Date()) ||
    user.failedLoginCount > 0
  );
}

export function UserRowActions({ user, onChanged }: UserRowActionsProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const passwordValid = PasswordPolicy.safeParse(newPassword).success;

  async function resetPassword(): Promise<void> {
    const result = await apiRequest('POST', `/api/users/${user.id}/reset-password`, {
      newPassword,
    });

    setNewPassword('');

    if (result.ok) {
      toast.success(terminology.users.passwordReset);
      onChanged();
    } else {
      toast.error(messageForApiError(result.code));
    }
  }

  async function unlock(): Promise<void> {
    const result = await apiRequest('POST', `/api/users/${user.id}/unlock`);

    if (result.ok) {
      toast.success(terminology.users.unlocked);
      onChanged();
    } else {
      toast.error(messageForApiError(result.code));
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {isLocked(user) ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setUnlockOpen(true)}>
          <LockOpen className="size-4" aria-hidden />
          {terminology.users.unlock}
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(true)}>
        <KeyRound className="size-4" aria-hidden />
        {terminology.users.resetPassword}
      </Button>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);

          if (!open) {
            setNewPassword('');
          }
        }}
        title={`${terminology.users.resetPassword}: ${user.username}`}
        description={terminology.users.resetDescription}
        confirmLabel={terminology.users.resetPassword}
        confirmDisabled={!passwordValid}
        onConfirm={() => void resetPassword()}
      >
        <div className="space-y-1">
          <Label htmlFor={`reset-password-${user.id}`}>
            {terminology.users.fieldTemporaryPassword}
          </Label>
          <Input
            id={`reset-password-${user.id}`}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{terminology.account.passwordPolicy}</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        title={terminology.users.unlockTitle}
        description={terminology.users.unlockDescription}
        confirmLabel={terminology.users.unlock}
        onConfirm={() => void unlock()}
      />
    </div>
  );
}
