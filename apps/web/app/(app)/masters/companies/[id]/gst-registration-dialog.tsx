'use client';

import {
  GST_REGISTRATION_TYPES,
  CreateGstRegistrationRequest,
  isValidGstin,
  isValidPinCode,
  type GstRegistrationResponse,
  type StateResponse,
} from '@uie/contracts';
import { useState } from 'react';
import { z } from 'zod';
import { DateField, FormLayout, SelectField, TextField } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { buildStateOptions } from '@/lib/state-options';
import * as toast from '@/lib/toast';

const registrationSchema = z.object({
  gstin: z.string().refine(isValidGstin, terminology.validation.invalidGstin),
  stateId: z.string().min(1, terminology.validation.required),
  registrationType: z.enum(GST_REGISTRATION_TYPES),
  effectiveFrom: z.string(),
  addressLine1: z.string().trim().min(1, terminology.validation.required).max(200),
  addressLine2: z.string().max(200),
  city: z.string().trim().min(1, terminology.validation.required).max(100),
  pinCode: z.string().refine(isValidPinCode, terminology.validation.invalidPinCode),
});

type RegistrationFormValues = z.infer<typeof registrationSchema>;

export interface GstRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Present when editing an existing registration. */
  registration?: GstRegistrationResponse;
  states: StateResponse[];
  onSaved: () => void;
}

export function GstRegistrationDialog({
  open,
  onOpenChange,
  companyId,
  registration,
  states,
  onSaved,
}: GstRegistrationDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = registration !== undefined;
  const stateOptions = buildStateOptions(states, registration?.state.id ?? null);

  // Defaults are only read when the form mounts (the dialog is keyed by registration id).
  const [defaults] = useState<RegistrationFormValues>(() => ({
    gstin: registration?.gstin ?? '',
    stateId: registration?.state.id ?? '',
    registrationType: registration?.registrationType ?? 'REGULAR',
    effectiveFrom: registration?.effectiveFrom ?? '',
    addressLine1: registration?.addressLine1 ?? '',
    addressLine2: registration?.addressLine2 ?? '',
    city: registration?.city ?? '',
    pinCode: registration?.pinCode ?? '',
  }));

  async function handleSubmit(values: RegistrationFormValues): Promise<void> {
    setErrorMessage(null);

    const checked = CreateGstRegistrationRequest.safeParse(values);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/gst-registrations/${registration.id}`, checked.data)
      : await apiRequest('POST', `/api/companies/${companyId}/gst-registrations`, checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(
      isEdit ? terminology.gstRegistrations.updated : terminology.gstRegistrations.created,
    );
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="mb-3 space-y-1">
          <DialogTitle>
            {isEdit
              ? terminology.gstRegistrations.editTitle
              : terminology.gstRegistrations.addTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {terminology.gstRegistrations.title}
          </DialogDescription>
        </div>
        {errorMessage === null ? null : (
          <p role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <FormLayout<RegistrationFormValues>
          schema={registrationSchema}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField<RegistrationFormValues>
              name="gstin"
              label={terminology.gstRegistrations.fieldGstin}
              required
            />
            <SelectField<RegistrationFormValues>
              name="stateId"
              label={terminology.gstRegistrations.fieldState}
              options={stateOptions}
              placeholder={terminology.gstRegistrations.fieldState}
              required
            />
            <SelectField<RegistrationFormValues>
              name="registrationType"
              label={terminology.gstRegistrations.fieldType}
              options={GST_REGISTRATION_TYPES.map((value) => ({
                value,
                label: terminology.gstRegistrations.types[value],
              }))}
              required
            />
            <DateField<RegistrationFormValues>
              name="effectiveFrom"
              label={terminology.gstRegistrations.fieldEffectiveFrom}
            />
            <TextField<RegistrationFormValues>
              name="addressLine1"
              label={terminology.gstRegistrations.fieldAddressLine1}
              required
            />
            <TextField<RegistrationFormValues>
              name="addressLine2"
              label={terminology.gstRegistrations.fieldAddressLine2}
            />
            <TextField<RegistrationFormValues>
              name="city"
              label={terminology.gstRegistrations.fieldCity}
              required
            />
            <TextField<RegistrationFormValues>
              name="pinCode"
              label={terminology.gstRegistrations.fieldPinCode}
              required
            />
          </div>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
