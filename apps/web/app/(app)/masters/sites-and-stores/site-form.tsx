'use client';

import {
  CreateSiteRequest,
  UpdateSiteRequest,
  isValidMasterCode,
  isValidPhone,
  isValidPinCode,
  type SiteResponse,
  type StateResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, FormSection, SelectField, TextField } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { buildStateOptions, NO_STATE_VALUE, type SelectOption } from '@/lib/state-options';
import * as toast from '@/lib/toast';

const optionalOf = (check: (value: string) => boolean, message: string) =>
  z.string().refine((value) => value.trim().length === 0 || check(value), message);

const baseShape = {
  name: z.string().trim().min(1, terminology.validation.required).max(200),
  addressLine1: z.string().max(200),
  addressLine2: z.string().max(200),
  city: z.string().max(100),
  stateId: z.string(),
  pinCode: optionalOf(isValidPinCode, terminology.validation.invalidPinCode),
  contactPerson: z.string().max(120),
  contactPhone: optionalOf(isValidPhone, terminology.validation.invalidPhone),
};

const createSchema = z.object({
  ...baseShape,
  projectId: z.string().min(1, terminology.validation.selectProject),
  code: z.string().refine(isValidMasterCode, terminology.validation.invalidCode),
});
// Project and code are disabled when editing, and react-hook-form leaves disabled values out.
const editSchema = z.object({
  ...baseShape,
  projectId: z.string().optional(),
  code: z.string().optional(),
});

type SiteFormValues = z.infer<typeof createSchema>;

export interface SiteFormProps {
  site?: SiteResponse;
  states: StateResponse[];
  /** Active projects when creating; just the site's own project when editing. */
  projectOptions: SelectOption[];
}

export function SiteForm({ site, states, projectOptions }: SiteFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = site !== undefined;
  const stateOptions = [
    { value: NO_STATE_VALUE, label: terminology.labels.none },
    ...buildStateOptions(states, site?.state?.id ?? null),
  ];

  // Defaults are only read when the form mounts.
  const [defaults] = useState<SiteFormValues>(() => ({
    projectId: site?.project.id ?? '',
    code: site?.code ?? '',
    name: site?.name ?? '',
    addressLine1: site?.addressLine1 ?? '',
    addressLine2: site?.addressLine2 ?? '',
    city: site?.city ?? '',
    stateId: site?.state?.id ?? NO_STATE_VALUE,
    pinCode: site?.pinCode ?? '',
    contactPerson: site?.contactPerson ?? '',
    contactPhone: site?.contactPhone ?? '',
  }));

  async function handleSubmit(values: SiteFormValues): Promise<void> {
    setErrorMessage(null);

    const payload = {
      ...values,
      projectId: isEdit ? site.project.id : values.projectId,
      code: isEdit ? site.code : values.code,
      stateId: values.stateId === NO_STATE_VALUE ? '' : values.stateId,
    };
    // Validate once more against the real API contract before sending.
    const checked = isEdit
      ? UpdateSiteRequest.safeParse(payload)
      : CreateSiteRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/sites/${site.id}`, checked.data)
      : await apiRequest<{ id: string }>('POST', '/api/sites', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.sites.updated : terminology.sites.created);
    router.push(
      isEdit
        ? '/masters/sites-and-stores'
        : `/masters/sites-and-stores/${(result.data as { id: string }).id}`,
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<SiteFormValues>
        schema={isEdit ? (editSchema as unknown as typeof createSchema) : createSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/masters/sites-and-stores')}
      >
        <FormSection title={terminology.sites.sectionDetails}>
          <SelectField<SiteFormValues>
            name="projectId"
            label={terminology.sites.fieldProject}
            description={isEdit ? terminology.sites.fieldProjectHint : undefined}
            options={projectOptions}
            placeholder={terminology.sites.fieldProject}
            disabled={isEdit}
            required
          />
          <TextField<SiteFormValues>
            name="code"
            label={terminology.sites.fieldCode}
            description={terminology.sites.fieldCodeHint}
            disabled={isEdit}
            required
          />
          <TextField<SiteFormValues> name="name" label={terminology.sites.fieldName} required />
        </FormSection>
        <FormSection title={terminology.sites.sectionAddress}>
          <TextField<SiteFormValues>
            name="addressLine1"
            label={terminology.sites.fieldAddressLine1}
          />
          <TextField<SiteFormValues>
            name="addressLine2"
            label={terminology.sites.fieldAddressLine2}
          />
          <TextField<SiteFormValues> name="city" label={terminology.sites.fieldCity} />
          <SelectField<SiteFormValues>
            name="stateId"
            label={terminology.sites.fieldState}
            options={stateOptions}
            placeholder={terminology.labels.none}
          />
          <TextField<SiteFormValues> name="pinCode" label={terminology.sites.fieldPinCode} />
        </FormSection>
        <FormSection title={terminology.sites.sectionContact}>
          <TextField<SiteFormValues>
            name="contactPerson"
            label={terminology.sites.fieldContactPerson}
          />
          <TextField<SiteFormValues>
            name="contactPhone"
            label={terminology.sites.fieldContactPhone}
            type="tel"
          />
        </FormSection>
      </FormLayout>
    </div>
  );
}
