'use client';

import type { ContextOptionsResponse, SessionContext } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { terminology } from '@/config/terminology';
import {
  applyChange,
  changeCompany,
  changeProject,
  companyOptions,
  projectOptionsFor,
  type ContextChange,
} from '@/lib/context';
import * as toast from '@/lib/toast';
import { Switcher } from './switcher';

export interface ContextSwitchersProps {
  options: ContextOptionsResponse;
  context: SessionContext;
  /** Server action: PUT /api/auth/context. Resolves true when the API accepted the change. */
  onChangeContext: (change: ContextChange) => Promise<boolean>;
}

/**
 * Company and project switchers. They show the context held in the session; choosing a value saves
 * it through the server action and then refreshes the page data so lists pick up the new context.
 */
export function ContextSwitchers({ options, context, onChangeContext }: ContextSwitchersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState<SessionContext>(context);
  const [seen, setSeen] = useState<SessionContext>(context);

  // A refresh delivers the saved context; adopt it when it differs from what was last received.
  if (seen !== context) {
    setSeen(context);
    setShown(context);
  }

  function choose(change: ContextChange): void {
    const previous = shown;

    setShown(applyChange(shown, options, change));
    startTransition(async () => {
      const saved = await onChangeContext(change);

      if (saved) {
        router.refresh();
      } else {
        setShown(previous);
        toast.error(terminology.shell.contextChangeFailed);
      }
    });
  }

  return (
    <>
      <Switcher
        options={companyOptions(options)}
        value={shown.companyId}
        onChange={(companyId) => choose(changeCompany(companyId))}
        placeholder={terminology.shell.selectCompany}
        allLabel={terminology.shell.allCompanies}
        busy={pending}
      />
      <Switcher
        options={projectOptionsFor(options, shown.companyId)}
        value={shown.projectId}
        onChange={(projectId) => choose(changeProject(shown.companyId, projectId))}
        placeholder={terminology.shell.selectProject}
        allLabel={terminology.shell.allProjects}
        busy={pending}
      />
    </>
  );
}
