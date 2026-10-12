'use client';

import {
  CompanyDetailResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  isValidMasterCode,
  type ProjectResponse,
  type StateResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormLayout, FormSection, SelectField, TextField } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiRead, apiRequest, messageForApiError } from '@/lib/api/client';
import { buildStateOptions, NO_STATE_VALUE, type SelectOption } from '@/lib/state-options';
import * as toast from '@/lib/toast';

const NO_BILLING_VALUE = 'none';

const baseShape = {
  name: z.string().trim().min(1, terminology.validation.required).max(200),
  stateId: z.string(),
  billingGstRegistrationId: z.string(),
};

const createSchema = z.object({
  ...baseShape,
  companyId: z.string().min(1, terminology.validation.selectCompany),
  code: z.string().refine(isValidMasterCode, terminology.validation.invalidCode),
});
// Company and code are disabled when editing, and react-hook-form leaves disabled values out.
const editSchema = z.object({
  ...baseShape,
  companyId: z.string().optional(),
  code: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof createSchema>;

export interface ProjectFormProps {
  project?: ProjectResponse;
  states: StateResponse[];
  companyOptions: SelectOption[];
  /** Active registrations of the project's company; required when editing (loaded on the server). */
  billingOptions?: SelectOption[];
}

/**
 * Billing select: the active GST registrations of the chosen company. When editing, the company
 * is fixed and its registrations arrive from the server; when creating, they load on company change.
 */
function BillingField({
  fixedOptions,
  currentRegistration,
  onLoadError,
}: {
  fixedOptions: SelectOption[] | null;
  currentRegistration: ProjectResponse['billingGstRegistration'];
  onLoadError: () => void;
}) {
  const { control, setValue, getValues } = useFormContext<ProjectFormValues>();
  const companyId = useWatch({ control, name: 'companyId' });
  const [loaded, setLoaded] = useState<SelectOption[]>([]);
  const options = fixedOptions ?? loaded;

  useEffect(() => {
    if (fixedOptions !== null) {
      return;
    }

    let active = true;

    setLoaded([]);
    setValue('billingGstRegistrationId', NO_BILLING_VALUE);

    if (companyId === undefined || companyId === '') {
      return;
    }

    void apiRead(`/api/companies/${companyId}`, CompanyDetailResponse).then((result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        onLoadError();
        return;
      }

      setLoaded(
        result.data.gstRegistrations
          .filter((registration) => registration.isActive)
          .map((registration) => ({ value: registration.id, label: registration.gstin })),
      );
    });

    return () => {
      active = false;
    };
  }, [companyId]);

  // A registration deactivated after it was chosen stays selectable so the project can be saved.
  const withCurrent =
    currentRegistration !== null &&
    getValues('billingGstRegistrationId') === currentRegistration.id &&
    !options.some((option) => option.value === currentRegistration.id)
      ? [...options, { value: currentRegistration.id, label: currentRegistration.gstin }]
      : options;

  return (
    <SelectField<ProjectFormValues>
      name="billingGstRegistrationId"
      label={terminology.projects.fieldBilling}
      description={terminology.projects.fieldBillingHint}
      options={[{ value: NO_BILLING_VALUE, label: terminology.projects.noBilling }, ...withCurrent]}
      placeholder={terminology.projects.noBilling}
    />
  );
}

export function ProjectForm({ project, states, companyOptions, billingOptions }: ProjectFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = project !== undefined;
  const stateOptions = [
    { value: NO_STATE_VALUE, label: terminology.labels.none },
    ...buildStateOptions(states, project?.state?.id ?? null),
  ];

  // Defaults are only read when the form mounts.
  const [defaults] = useState<ProjectFormValues>(() => ({
    companyId: project?.company.id ?? '',
    code: project?.code ?? '',
    name: project?.name ?? '',
    stateId: project?.state?.id ?? NO_STATE_VALUE,
    billingGstRegistrationId: project?.billingGstRegistration?.id ?? NO_BILLING_VALUE,
  }));

  async function handleSubmit(values: ProjectFormValues): Promise<void> {
    setErrorMessage(null);

    const payload = {
      ...values,
      companyId: isEdit ? project.company.id : values.companyId,
      code: isEdit ? project.code : values.code,
      stateId: values.stateId === NO_STATE_VALUE ? '' : values.stateId,
      billingGstRegistrationId:
        values.billingGstRegistrationId === NO_BILLING_VALUE ? '' : values.billingGstRegistrationId,
    };
    // Validate once more against the real API contract before sending.
    const checked = isEdit
      ? UpdateProjectRequest.safeParse(payload)
      : CreateProjectRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/projects/${project.id}`, checked.data)
      : await apiRequest('POST', '/api/projects', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.projects.updated : terminology.projects.created);
    router.push('/masters/projects');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<ProjectFormValues>
        schema={isEdit ? (editSchema as unknown as typeof createSchema) : createSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/masters/projects')}
      >
        <FormSection title={terminology.projects.sectionDetails}>
          <SelectField<ProjectFormValues>
            name="companyId"
            label={terminology.projects.fieldCompany}
            description={isEdit ? terminology.projects.fieldCompanyHint : undefined}
            options={companyOptions}
            placeholder={terminology.projects.fieldCompany}
            disabled={isEdit}
            required
          />
          <TextField<ProjectFormValues>
            name="code"
            label={terminology.projects.fieldCode}
            description={terminology.projects.fieldCodeHint}
            disabled={isEdit}
            required
          />
          <TextField<ProjectFormValues>
            name="name"
            label={terminology.projects.fieldName}
            required
          />
          <SelectField<ProjectFormValues>
            name="stateId"
            label={terminology.projects.fieldState}
            options={stateOptions}
            placeholder={terminology.labels.none}
          />
        </FormSection>
        <FormSection title={terminology.projects.sectionBilling}>
          <BillingField
            fixedOptions={isEdit ? (billingOptions ?? []) : null}
            currentRegistration={project?.billingGstRegistration ?? null}
            onLoadError={() => setErrorMessage(terminology.projects.registrationsUnavailable)}
          />
        </FormSection>
      </FormLayout>
    </div>
  );
}
