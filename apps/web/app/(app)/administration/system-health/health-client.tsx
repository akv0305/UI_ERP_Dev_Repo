'use client';

import { useState } from 'react';
import { HealthResponse } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { HealthFields } from './health-fields';

type ClientState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: HealthResponse }
  | { kind: 'error' };

export function HealthClient() {
  const [state, setState] = useState<ClientState>({ kind: 'idle' });

  async function handleClick(): Promise<void> {
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const payload: unknown = await response.json();
      const parsed = HealthResponse.safeParse(payload);

      setState(parsed.success ? { kind: 'success', data: parsed.data } : { kind: 'error' });
    } catch {
      setState({ kind: 'error' });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-1 text-lg font-medium">{terminology.home.clientSectionTitle}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{terminology.home.clientSectionHint}</p>

      <button
        type="button"
        onClick={handleClick}
        disabled={state.kind === 'loading'}
        className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {state.kind === 'loading' ? terminology.actions.checking : terminology.actions.checkHealth}
      </button>

      <div className="mt-3 text-sm">
        {state.kind === 'idle' ? (
          <p className="text-muted-foreground">{terminology.messages.clientIdle}</p>
        ) : null}

        {state.kind === 'error' ? (
          <p className="text-destructive">{terminology.messages.clientError}</p>
        ) : null}

        {state.kind === 'success' ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">{terminology.messages.clientSuccess}</p>
            <HealthFields data={state.data} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
