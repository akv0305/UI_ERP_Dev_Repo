'use client';

import {
  CreateVendorContactRequest,
  PHONE_PATTERN,
  type VendorContactResponse,
} from '@uie/contracts';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, SwitchField, TextField } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

const t = terminology.vendorContacts;
const v = terminology.validation;

const schema = z.object({
  name: z.string().trim().min(1, v.required).max(120),
  designation: z.string().max(100),
  phone: z
    .string()
    .refine((value) => value.trim() === '' || PHONE_PATTERN.test(value.trim()), v.invalidPhone),
  email: z
    .string()
    .refine(
      (value) => value.trim() === '' || z.email().max(254).safeParse(value.trim()).success,
      v.invalidEmail,
    ),
  isPrimary: z.boolean(),
});

type ContactFormValues = z.infer<typeof schema>;

export interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  contact?: VendorContactResponse;
  onSaved: () => void;
}

export function ContactDialog({
  open,
  onOpenChange,
  vendorId,
  contact,
  onSaved,
}: ContactDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = contact !== undefined;

  const [defaults] = useState<ContactFormValues>(() => ({
    name: contact?.name ?? '',
    designation: contact?.designation ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    isPrimary: contact?.isPrimary ?? false,
  }));

  async function handleSubmit(values: ContactFormValues): Promise<void> {
    setErrorMessage(null);

    const checked = CreateVendorContactRequest.safeParse(values);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/vendor-contacts/${contact.id}`, checked.data)
      : await apiRequest('POST', `/api/vendors/${vendorId}/contacts`, checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? t.updated : t.created);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="mb-3 space-y-1">
          <DialogTitle>{isEdit ? t.editTitle : t.addTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.title}</DialogDescription>
        </div>
        {errorMessage === null ? null : (
          <p role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <FormLayout<ContactFormValues>
          schema={schema}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField<ContactFormValues> name="name" label={t.fieldName} required />
            <TextField<ContactFormValues> name="designation" label={t.fieldDesignation} />
            <TextField<ContactFormValues> name="phone" type="tel" label={t.fieldPhone} />
            <TextField<ContactFormValues> name="email" type="email" label={t.fieldEmail} />
            <SwitchField<ContactFormValues>
              name="isPrimary"
              label={t.fieldPrimary}
              description={t.fieldPrimaryHint}
              className="sm:col-span-2"
            />
          </div>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
