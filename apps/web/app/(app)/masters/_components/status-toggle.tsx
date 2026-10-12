'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

export interface StatusToggleLabels {
  deactivateTitle: string;
  deactivateDescription: string;
  reactivateTitle: string;
  reactivateDescription: string;
  deactivated: string;
  reactivated: string;
}

export interface StatusToggleProps {
  isActive: boolean;
  /** API path of the record, for example /api/companies/<id>; /deactivate or /reactivate is added. */
  path: string;
  labels: StatusToggleLabels;
  onChanged: () => void;
}

/** Deactivate / Reactivate button with a confirmation dialog. There is no delete. */
export function StatusToggle({ isActive, path, labels, onChanged }: StatusToggleProps) {
  const [open, setOpen] = useState(false);

  async function apply(): Promise<void> {
    const result = await apiRequest('POST', `${path}/${isActive ? 'deactivate' : 'reactivate'}`);

    if (result.ok) {
      toast.success(isActive ? labels.deactivated : labels.reactivated);
      onChanged();
    } else {
      toast.error(messageForApiError(result.code));
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {isActive ? terminology.masters.deactivate : terminology.masters.activate}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={isActive ? 'danger' : 'default'}
        title={isActive ? labels.deactivateTitle : labels.reactivateTitle}
        description={isActive ? labels.deactivateDescription : labels.reactivateDescription}
        confirmLabel={isActive ? terminology.masters.deactivate : terminology.masters.activate}
        onConfirm={() => void apply()}
      />
    </>
  );
}
