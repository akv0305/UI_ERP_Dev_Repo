'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';

function messageForCode(code: string | undefined): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return terminology.login.invalidCredentials;
    case 'ACCOUNT_LOCKED':
      return terminology.login.accountLocked;
    case 'RATE_LIMITED':
      return terminology.login.rateLimited;
    default:
      return terminology.login.genericError;
  }
}

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      if (response.ok) {
        router.replace('/home');
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;

      setErrorMessage(messageForCode(payload?.error?.code));
    } catch {
      setErrorMessage(terminology.login.genericError);
    }

    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="loginId">{terminology.login.loginId}</Label>
        <Input
          id="loginId"
          name="loginId"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{terminology.login.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? terminology.login.submitting : terminology.login.submit}
      </Button>
    </form>
  );
}
