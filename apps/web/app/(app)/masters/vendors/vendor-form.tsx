'use client';

import {
  AMOUNT_PATTERN,
  CreateVendorRequest,
  MAX_PAYMENT_TERMS_DAYS,
  MSME_CATEGORIES,
  UDYAM_PATTERN,
  UpdateVendorRequest,
  VENDOR_TYPES,
  isValidPan,
  isValidPinCode,
  normalizeIdentifier,
  type StateResponse,
  type VendorResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import {
  FormLayout,
  FormSection,
  SelectField,
  TextareaField,
  TextField,
  type FieldOption,
} from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { buildStateOptions, NO_STATE_VALUE } from '@/lib/state-options';
import * as toast from '@/lib/toast';

const t = terminology.vendors;
const v = terminology.validation;

/** Select value for "no MSME category"; sent as blank, which the contract turns into null. */
const NO_MSME_VALUE = 'none';
const WHOLE_DAYS = /^\d{1,3}$/;

const optionalOf = (check: (value: string) => boolean, message: string) =>
  z.string().refine((value) => value.trim().length === 0 || check(value.trim()), message);

// Form-level schema: the contract's rules with on-screen messages from terminology.
const schema = z
  .object({
    legalName: z.string().trim().min(1, v.required).max(200),
    tradeName: z.string().max(200),
    vendorType: z.enum(VENDOR_TYPES),
    pan: optionalOf(isValidPan, v.invalidPan),
    udyamNumber: optionalOf(
      (value) => UDYAM_PATTERN.test(normalizeIdentifier(value)),
      v.invalidUdyam,
    ),
    msmeCategory: z.string(),
    addressLine1: z.string().max(200),
    addressLine2: z.string().max(200),
    city: z.string().max(100),
    stateId: z.string(),
    pinCode: optionalOf(isValidPinCode, v.invalidPinCode),
    paymentTermsDays: optionalOf(
      (value) => WHOLE_DAYS.test(value) && Number(value) <= MAX_PAYMENT_TERMS_DAYS,
      v.invalidPaymentTerms,
    ),
    creditLimit: optionalOf((value) => AMOUNT_PATTERN.test(value), v.invalidAmount),
    remarks: z.string().max(500),
  })
  .superRefine((values, ctx) => {
    const hasUdyam = values.udyamNumber.trim().length > 0;
    const hasCategory = values.msmeCategory !== NO_MSME_VALUE;

    if (hasUdyam !== hasCategory) {
      ctx.addIssue({
        code: 'custom',
        path: [hasUdyam ? 'msmeCategory' : 'udyamNumber'],
        message: v.msmePair,
      });
    }
  });

type VendorFormValues = z.infer<typeof schema>;

const TYPE_OPTIONS: FieldOption[] = VENDOR_TYPES.map((value) => ({
  value,
  label: t.types[value],
}));

const MSME_OPTIONS: FieldOption[] = [
  { value: NO_MSME_VALUE, label: terminology.labels.none },
  ...MSME_CATEGORIES.map((value) => ({ value, label: t.msmeCategories[value] })),
];

export interface VendorFormProps {
  /** Present when editing; only vendors with canEdit (Draft or Rejected) reach the form. */
  vendor?: VendorResponse;
  states: StateResponse[];
}

export function VendorForm({ vendor, states }: VendorFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = vendor !== undefined;
  const stateOptions: FieldOption[] = [
    { value: NO_STATE_VALUE, label: terminology.labels.none },
    ...buildStateOptions(states, vendor?.state?.id ?? null),
  ];

  const [defaults] = useState<VendorFormValues>(() => ({
    legalName: vendor?.legalName ?? '',
    tradeName: vendor?.tradeName ?? '',
    vendorType: vendor?.vendorType ?? 'SUPPLIER',
    pan: vendor?.pan ?? '',
    udyamNumber: vendor?.udyamNumber ?? '',
    msmeCategory: vendor?.msmeCategory ?? NO_MSME_VALUE,
    addressLine1: vendor?.addressLine1 ?? '',
    addressLine2: vendor?.addressLine2 ?? '',
    city: vendor?.city ?? '',
    stateId: vendor?.state?.id ?? NO_STATE_VALUE,
    pinCode: vendor?.pinCode ?? '',
    paymentTermsDays:
      vendor?.paymentTermsDays === null || vendor === undefined
        ? ''
        : String(vendor.paymentTermsDays),
    creditLimit: vendor?.creditLimit ?? '',
    remarks: vendor?.remarks ?? '',
  }));

  async function handleSubmit(values: VendorFormValues): Promise<void> {
    setErrorMessage(null);

    // Blank optional fields become null in the contract schemas.
    const payload = {
      ...values,
      stateId: values.stateId === NO_STATE_VALUE ? '' : values.stateId,
      msmeCategory: values.msmeCategory === NO_MSME_VALUE ? '' : values.msmeCategory,
    };
    const checked = isEdit
      ? UpdateVendorRequest.safeParse(payload)
      : CreateVendorRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    if (isEdit) {
      const result = await apiRequest('PATCH', `/api/vendors/${vendor.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(messageForApiError(result.code));
        return;
      }

      toast.success(t.updated);
      router.refresh();
      return;
    }

    const result = await apiRequest<VendorResponse>('POST', '/api/vendors', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/masters/vendors/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<VendorFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push(isEdit ? `/masters/vendors/${vendor.id}` : '/masters/vendors')}
      >
        <FormSection title={t.sectionVendor}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField<VendorFormValues>
              name="legalName"
              label={t.fieldLegalName}
              description={isEdit ? undefined : t.codeAutoHint}
              className="md:col-span-2"
              required
            />
            <TextField<VendorFormValues> name="tradeName" label={t.fieldTradeName} />
            <SelectField<VendorFormValues>
              name="vendorType"
              label={t.fieldType}
              options={TYPE_OPTIONS}
              required
            />
          </div>
        </FormSection>
        <FormSection title={t.sectionTax}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField<VendorFormValues> name="pan" label={t.fieldPan} />
            <div className="hidden md:block" />
            <TextField<VendorFormValues>
              name="udyamNumber"
              label={t.fieldUdyam}
              description={t.fieldUdyamHint}
            />
            <SelectField<VendorFormValues>
              name="msmeCategory"
              label={t.fieldMsme}
              options={MSME_OPTIONS}
            />
          </div>
        </FormSection>
        <FormSection title={t.sectionAddress}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField<VendorFormValues> name="addressLine1" label={t.fieldAddressLine1} />
            <TextField<VendorFormValues> name="addressLine2" label={t.fieldAddressLine2} />
            <TextField<VendorFormValues> name="city" label={t.fieldCity} />
            <SelectField<VendorFormValues>
              name="stateId"
              label={t.fieldState}
              options={stateOptions}
              placeholder={terminology.labels.none}
            />
            <TextField<VendorFormValues> name="pinCode" label={t.fieldPinCode} />
          </div>
        </FormSection>
        <FormSection title={t.sectionTerms}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField<VendorFormValues>
              name="paymentTermsDays"
              label={t.fieldPaymentTerms}
              description={t.fieldPaymentTermsHint}
            />
            <TextField<VendorFormValues>
              name="creditLimit"
              label={t.fieldCreditLimit}
              description={t.fieldCreditLimitHint}
            />
            <TextareaField<VendorFormValues>
              name="remarks"
              label={t.fieldRemarks}
              className="md:col-span-2"
              rows={3}
            />
          </div>
        </FormSection>
      </FormLayout>
    </div>
  );
}
