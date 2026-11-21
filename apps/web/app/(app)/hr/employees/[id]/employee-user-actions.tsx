'use client';

import {
  LinkableUsersResponse,
  PasswordPolicy,
  type EmployeeResponse,
  type LinkableUserOption,
} from '@uie/contracts';
import { Link2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { terminology } from '@/config/terminology';
import { apiRead, apiRequest } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { employeeErrorMessage } from '../_components/employee-text';

const t = terminology.employees;

type LinkState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; users: LinkableUserOption[] };

/** Shown only when canCreateUser: no user yet, active, not Left, manageable (OQ-148, OQ-149). */
export function EmployeeUserActions({ employee }: { employee: EmployeeResponse }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>({ kind: 'loading' });
  const [userId, setUserId] = useState('');
  const passwordValid = PasswordPolicy.safeParse(password).success;

  async function createUser(): Promise<void> {
    const result = await apiRequest('POST', `/api/employees/${employee.id}/create-user`, {
      temporaryPassword: password,
    });

    setPassword('');

    if (result.ok) {
      toast.success(t.userCreated);
      router.refresh();
    } else {
      toast.error(employeeErrorMessage(result.code));
    }
  }

  async function openLink(): Promise<void> {
    setUserId('');
    setLinkState({ kind: 'loading' });
    setLinkOpen(true);

    const result = await apiRead(
      `/api/employees/${employee.id}/linkable-users`,
      LinkableUsersResponse,
    );

    setLinkState(result.ok ? { kind: 'ready', users: result.data.items } : { kind: 'error' });
  }

  async function linkUser(): Promise<void> {
    const result = await apiRequest('POST', `/api/employees/${employee.id}/link-user`, {
      userId,
    });

    if (result.ok) {
      toast.success(t.userLinked);
      router.refresh();
    } else {
      toast.error(employeeErrorMessage(result.code));
    }
  }

  let linkBody;

  if (linkState.kind === 'loading') {
    linkBody = <p className="text-sm text-muted-foreground">{t.loading}</p>;
  } else if (linkState.kind === 'error') {
    linkBody = <p className="text-sm text-danger">{t.linkableUsersError}</p>;
  } else if (linkState.users.length === 0) {
    linkBody = <p className="text-sm text-muted-foreground">{t.noLinkableUsers}</p>;
  } else {
    linkBody = (
      <div className="space-y-1">
        <Label htmlFor={`link-user-${employee.id}`}>{t.linkUserLabel}</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger id={`link-user-${employee.id}`}>
            <SelectValue placeholder={t.linkUserPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {linkState.users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
        <UserPlus className="size-4" aria-hidden />
        {t.createUser}
      </Button>
      <Button type="button" variant="outline" onClick={() => void openLink()}>
        <Link2 className="size-4" aria-hidden />
        {t.linkUser}
      </Button>

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);

          if (!open) {
            setPassword('');
          }
        }}
        title={t.createUserTitle}
        description={t.createUserDescription}
        confirmLabel={t.createUser}
        confirmDisabled={!passwordValid}
        onConfirm={() => void createUser()}
      >
        <div className="space-y-1">
          <Label htmlFor={`create-user-${employee.id}`}>{t.temporaryPasswordLabel}</Label>
          <Input
            id={`create-user-${employee.id}`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{terminology.account.passwordPolicy}</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={t.linkUserTitle}
        description={t.linkUserDescription}
        confirmLabel={t.linkUser}
        confirmDisabled={userId === ''}
        onConfirm={() => void linkUser()}
      >
        {linkBody}
      </ConfirmDialog>
    </>
  );
}
