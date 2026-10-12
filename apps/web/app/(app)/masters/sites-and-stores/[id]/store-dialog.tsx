'use client';

import {
  CreateStoreRequest,
  UpdateStoreRequest,
  isValidMasterCode,
  type StoreResponse,
} from '@uie/contracts';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, TextField } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

const createSchema = z.object({
  code: z.string().refine(isValidMasterCode, terminology.validation.invalidCode),
  name: z.string().trim().min(1, terminology.validation.required).max(200),
});
// The code field is disabled when editing, and react-hook-form leaves disabled values out.
const editSchema = z.object({
  code: z.string().optional(),
  name: z.string().trim().min(1, terminology.validation.required).max(200),
});

type StoreFormValues = z.infer<typeof createSchema>;

export interface StoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  /** Present when editing an existing store. */
  store?: StoreResponse;
  onSaved: () => void;
}

export function StoreDialog({ open, onOpenChange, siteId, store, onSaved }: StoreDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = store !== undefined;

  // Defaults are only read when the form mounts (the dialog is keyed by store id).
  const [defaults] = useState<StoreFormValues>(() => ({
    code: store?.code ?? '',
    name: store?.name ?? '',
  }));

  async function handleSubmit(values: StoreFormValues): Promise<void> {
    setErrorMessage(null);

    const payload = { name: values.name, code: isEdit ? store.code : values.code };
    // Validate once more against the real API contract before sending.
    const checked = isEdit
      ? UpdateStoreRequest.safeParse(payload)
      : CreateStoreRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/stores/${store.id}`, checked.data)
      : await apiRequest('POST', `/api/sites/${siteId}/stores`, checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.stores.updated : terminology.stores.created);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="mb-3 space-y-1">
          <DialogTitle>
            {isEdit ? terminology.stores.editTitle : terminology.stores.addTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">{terminology.stores.title}</DialogDescription>
        </div>
        {errorMessage === null ? null : (
          <p role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <FormLayout<StoreFormValues>
          schema={isEdit ? (editSchema as unknown as typeof createSchema) : createSchema}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        >
          <div className="grid gap-4">
            <TextField<StoreFormValues>
              name="code"
              label={terminology.stores.fieldCode}
              description={terminology.stores.fieldCodeHint}
              disabled={isEdit}
              required
            />
            <TextField<StoreFormValues> name="name" label={terminology.stores.fieldName} required />
          </div>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
