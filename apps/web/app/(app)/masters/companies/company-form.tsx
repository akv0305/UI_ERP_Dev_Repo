'use client';

import {
  COMPANY_ENTITY_TYPES,
  CreateCompanyRequest,
  UpdateCompanyRequest,
  isValidCin,
  isValidLlpin,
  isValidMasterCode,
  isValidPan,
  isValidPinCode,
  isValidTan,
  type CompanyDetailResponse,
  type StateResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, FormSection, SelectField, TextField } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { buildStateOptions, NO_STATE_VALUE } from '@/lib/state-options';
import * as toast from '@/lib/toast';

const optionalOf = (check: (value: string) => boolean, message: string) =>
  z.string().refine((value) => value.trim().length === 0 || check(value), message);

// Form-level schema: the API contract's rules, with on-screen messages from terminology.
const baseShape = {
  legalName: z.string().trim().min(1, terminology.validation.required).max(200),
  entityType: z.enum(COMPANY_ENTITY_TYPES),
  pan: optionalOf(isValidPan, terminology.validation.invalidPan),
  tan: optionalOf(isValidTan, terminology.validation.invalidTan),
  cin: optionalOf(isValidCin, terminology.validation.invalidCin),
  llpin: optionalOf(isValidLlpin, terminology.validation.invalidLlpin),
  addressLine1: z.string().max(200),
  addressLine2: z.string().max(200),
  city: z.string().max(100),
  stateId: z.string(),
  pinCode: optionalOf(isValidPinCode, terminology.validation.invalidPinCode),
};

const createSchema = z.object({
  ...baseShape,
  code: z.string().refine(isValidMasterCode, terminology.validation.invalidCode),
});
// The code field is disabled when editing, and react-hook-form leaves disabled values out.
const editSchema = z.object({ ...baseShape, code: z.string().optional() });

type CompanyFormValues = z.infer<typeof createSchema>;

export interface CompanyFormProps {
  company?: CompanyDetailResponse;
  states: StateResponse[];
}

export function CompanyForm({ company, states }: CompanyFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = company !== undefined;
  const stateOptions = [
    { value: NO_STATE_VALUE, label: terminology.labels.none },
    ...buildStateOptions(states, company?.state?.id ?? null),
  ];

  // Defaults are only read when the form mounts.
  const [defaults] = useState<CompanyFormValues>(() => ({
    code: company?.code ?? '',
    legalName: company?.legalName ?? '',
    entityType: company?.entityType ?? 'COMPANY',
    pan: company?.pan ?? '',
    tan: company?.tan ?? '',
    cin: company?.cin ?? '',
    llpin: company?.llpin ?? '',
    addressLine1: company?.addressLine1 ?? '',
    addressLine2: company?.addressLine2 ?? '',
    city: company?.city ?? '',
    stateId: company?.state?.id ?? NO_STATE_VALUE,
    pinCode: company?.pinCode ?? '',
  }));

  async function handleSubmit(values: CompanyFormValues): Promise<void> {
    setErrorMessage(null);

    const payload = {
      ...values,
      stateId: values.stateId === NO_STATE_VALUE ? '' : values.stateId,
    };
    // Validate once more against the real API contract before sending.
    const checked = isEdit
      ? UpdateCompanyRequest.safeParse(payload)
      : CreateCompanyRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/companies/${company.id}`, checked.data)
      : await apiRequest<{ id: string }>('POST', '/api/companies', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.companies.updated : terminology.companies.created);
    router.push(
      isEdit ? '/masters/companies' : `/masters/companies/${(result.data as { id: string }).id}`,
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
      <FormLayout<CompanyFormValues>
        schema={isEdit ? (editSchema as unknown as typeof createSchema) : createSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/masters/companies')}
      >
        <FormSection title={terminology.companies.sectionDetails}>
          <TextField<CompanyFormValues>
            name="code"
            label={terminology.companies.fieldCode}
            description={terminology.companies.fieldCodeHint}
            disabled={isEdit}
            required
          />
          <TextField<CompanyFormValues>
            name="legalName"
            label={terminology.companies.fieldLegalName}
            required
          />
          <SelectField<CompanyFormValues>
            name="entityType"
            label={terminology.companies.fieldEntityType}
            options={COMPANY_ENTITY_TYPES.map((value) => ({
              value,
              label: terminology.companies.entityTypes[value],
            }))}
            required
          />
        </FormSection>
        <FormSection title={terminology.companies.sectionTax}>
          <TextField<CompanyFormValues> name="pan" label={terminology.companies.fieldPan} />
          <TextField<CompanyFormValues> name="tan" label={terminology.companies.fieldTan} />
          <TextField<CompanyFormValues> name="cin" label={terminology.companies.fieldCin} />
          <TextField<CompanyFormValues> name="llpin" label={terminology.companies.fieldLlpin} />
        </FormSection>
        <FormSection title={terminology.companies.sectionAddress}>
          <TextField<CompanyFormValues>
            name="addressLine1"
            label={terminology.companies.fieldAddressLine1}
          />
          <TextField<CompanyFormValues>
            name="addressLine2"
            label={terminology.companies.fieldAddressLine2}
          />
          <TextField<CompanyFormValues> name="city" label={terminology.companies.fieldCity} />
          <SelectField<CompanyFormValues>
            name="stateId"
            label={terminology.companies.fieldState}
            options={stateOptions}
            placeholder={terminology.labels.none}
          />
          <TextField<CompanyFormValues> name="pinCode" label={terminology.companies.fieldPinCode} />
        </FormSection>
      </FormLayout>
    </div>
  );
}
