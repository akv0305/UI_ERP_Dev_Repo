'use client';

import {
  CreateEmployeeRequest,
  EmployeeCodeSchema,
  PhoneSchema,
  UpdateEmployeeRequest,
  WORK_LOCATION_TYPES,
  normalizeEmployeeCode,
  type EmployeeFormOptionsResponse,
  type EmployeeResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  DateField,
  FieldShell,
  FormLayout,
  FormSection,
  SelectField,
  TextareaField,
  TextField,
  type FieldOption,
} from '@/components/erp';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { apiRequest } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { codeName, employeeErrorMessage } from './_components/employee-text';

const t = terminology.employees;
const v = terminology.validation;

/** Select value for "not set"; sent as blank, which the contract turns into null. */
const NONE = 'none';
const EmailCheck = z.email();

/** originalCode: the saved code when editing; a changed code needs remarks (OQ-135). */
function schemaFor(originalCode: string | null) {
  return z
    .object({
      companyId: z.string().min(1, v.selectCompany),
      code: z
        .string()
        .trim()
        .min(1, v.required)
        .refine((value) => EmployeeCodeSchema.safeParse(value).success, t.invalidCode),
      fullName: z.string().trim().min(1, v.required).max(120),
      designationId: z.string(),
      workLocationType: z.string(),
      projectId: z.string(),
      siteId: z.string(),
      dateOfJoining: z.string(),
      dateOfLeaving: z.string(),
      officialEmail: z
        .string()
        .trim()
        .max(254)
        .refine((value) => value === '' || EmailCheck.safeParse(value).success, v.invalidEmail),
      mobile: z
        .string()
        .trim()
        .refine((value) => value === '' || PhoneSchema.safeParse(value).success, v.invalidPhone),
      codeChangeRemarks: z.string().max(500),
    })
    .superRefine((values, ctx) => {
      if (values.workLocationType === 'PROJECT' && values.projectId === '') {
        ctx.addIssue({ code: 'custom', path: ['projectId'], message: v.selectProject });
      }

      if (
        values.dateOfJoining !== '' &&
        values.dateOfLeaving !== '' &&
        values.dateOfLeaving < values.dateOfJoining
      ) {
        ctx.addIssue({ code: 'custom', path: ['dateOfLeaving'], message: t.leavingBeforeJoining });
      }

      if (
        originalCode !== null &&
        normalizeEmployeeCode(values.code) !== originalCode &&
        values.codeChangeRemarks.trim() === ''
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['codeChangeRemarks'],
          message: t.codeChangeRemarksRequired,
        });
      }
    });
}

type EmployeeFormValues = z.infer<ReturnType<typeof schemaFor>>;

/** The employee's own designation / project / site stay selectable even if inactive now. */
function withExisting(
  options: EmployeeFormOptionsResponse,
  employee: EmployeeResponse | undefined,
): EmployeeFormOptionsResponse {
  if (employee === undefined) {
    return options;
  }

  const { designation, project, site } = employee;
  const designations =
    designation === null || options.designations.some((d) => d.id === designation.id)
      ? options.designations
      : [
          { id: designation.id, label: `${designation.name} ${t.inactiveSuffix}` },
          ...options.designations,
        ];
  const projects =
    project === null || options.projects.some((p) => p.id === project.id)
      ? options.projects
      : [
          {
            id: project.id,
            label: `${codeName(project.code, project.name)} ${t.inactiveSuffix}`,
            companyId: employee.company.id,
          },
          ...options.projects,
        ];
  const sites =
    site === null || options.sites.some((s) => s.id === site.id)
      ? options.sites
      : [
          {
            id: site.id,
            label: `${codeName(site.code, site.name)} ${t.inactiveSuffix}`,
            projectId: project?.id ?? '',
          },
          ...options.sites,
        ];

  return { ...options, designations, projects, sites };
}

export interface EmployeeFormProps {
  /** Present when editing (canManage). */
  employee?: EmployeeResponse;
  options: EmployeeFormOptionsResponse;
}

export function EmployeeForm({ employee, options }: EmployeeFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = employee !== undefined;
  const [formOptions] = useState(() => withExisting(options, employee));
  const [schema] = useState(() => schemaFor(employee?.code ?? null));

  // Companies come sorted by code; the first is the default (OQ-140, OQ-142).
  const [defaults] = useState<EmployeeFormValues>(() => ({
    companyId: employee?.company.id ?? options.companies[0]?.id ?? '',
    code: employee?.code ?? '',
    fullName: employee?.fullName ?? '',
    designationId: employee?.designation?.id ?? NONE,
    workLocationType: employee?.workLocationType ?? NONE,
    projectId: employee?.project?.id ?? '',
    siteId: employee?.site?.id ?? NONE,
    dateOfJoining: employee?.dateOfJoining ?? '',
    dateOfLeaving: employee?.dateOfLeaving ?? '',
    officialEmail: employee?.officialEmail ?? '',
    mobile: employee?.mobile ?? '',
    codeChangeRemarks: '',
  }));

  async function handleSubmit(values: EmployeeFormValues): Promise<void> {
    setErrorMessage(null);

    const atProject = values.workLocationType === 'PROJECT';
    // Blank optional fields become null in the contract schemas.
    const fields = {
      code: values.code,
      fullName: values.fullName,
      designationId: values.designationId === NONE ? '' : values.designationId,
      workLocationType: values.workLocationType === NONE ? '' : values.workLocationType,
      projectId: atProject ? values.projectId : '',
      siteId: atProject && values.siteId !== NONE ? values.siteId : '',
      dateOfJoining: values.dateOfJoining,
      dateOfLeaving: values.dateOfLeaving,
      officialEmail: values.officialEmail,
      mobile: values.mobile,
    };

    if (isEdit) {
      const checked = UpdateEmployeeRequest.safeParse({
        ...fields,
        codeChangeRemarks: values.codeChangeRemarks,
      });

      if (!checked.success) {
        setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
        return;
      }

      const result = await apiRequest('PATCH', `/api/employees/${employee.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(employeeErrorMessage(result.code));
        return;
      }

      toast.success(t.updated);
      router.refresh();
      return;
    }

    const checked = CreateEmployeeRequest.safeParse({ ...fields, companyId: values.companyId });

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = await apiRequest<EmployeeResponse>('POST', '/api/employees', checked.data);

    if (!result.ok) {
      setErrorMessage(employeeErrorMessage(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/hr/employees/${result.data.id}`);
  }

  const fixedCompanyLabel = isEdit
    ? codeName(employee.company.code, employee.company.name)
    : options.companies.length === 1
      ? (options.companies[0]?.label ?? null)
      : null;

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<EmployeeFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push(isEdit ? `/hr/employees/${employee.id}` : '/hr/employees')}
      >
        <EmployeeSections
          options={formOptions}
          fixedCompanyLabel={fixedCompanyLabel}
          originalCode={employee?.code ?? null}
        />
      </FormLayout>
    </div>
  );
}

function EmployeeSections({
  options,
  fixedCompanyLabel,
  originalCode,
}: {
  options: EmployeeFormOptionsResponse;
  /** Set when editing (company fixed after create) or when only one company is offered. */
  fixedCompanyLabel: string | null;
  originalCode: string | null;
}) {
  const { control, getValues, setValue } = useFormContext<EmployeeFormValues>();
  const companyId = useWatch({ control, name: 'companyId' });
  const workLocationType = useWatch({ control, name: 'workLocationType' });
  const projectId = useWatch({ control, name: 'projectId' });
  const code = useWatch({ control, name: 'code' });

  // Project only for work location Project, and only of the company; picks the only one.
  useEffect(() => {
    if (workLocationType !== 'PROJECT') {
      if (getValues('projectId') !== '') {
        setValue('projectId', '');
      }

      return;
    }

    const projects = options.projects.filter((p) => p.companyId === companyId);

    if (!projects.some((p) => p.id === getValues('projectId'))) {
      setValue('projectId', projects.length === 1 ? (projects[0]?.id ?? '') : '');
    }
  }, [companyId, workLocationType, options, getValues, setValue]);

  // A site must belong to the project.
  useEffect(() => {
    const current = getValues('siteId');

    if (
      current !== NONE &&
      !options.sites.some((s) => s.id === current && s.projectId === projectId)
    ) {
      setValue('siteId', NONE);
    }
  }, [projectId, options, getValues, setValue]);

  const companyOptions: FieldOption[] = options.companies.map((c) => ({
    value: c.id,
    label: c.label,
  }));
  const designationOptions: FieldOption[] = [
    { value: NONE, label: t.noDesignation },
    ...options.designations.map((d) => ({ value: d.id, label: d.label })),
  ];
  const workLocationOptions: FieldOption[] = [
    { value: NONE, label: t.workLocationNotSet },
    ...WORK_LOCATION_TYPES.map((type) => ({ value: type, label: t.workLocations[type] })),
  ];
  const projectOptions: FieldOption[] = options.projects
    .filter((p) => p.companyId === companyId)
    .map((p) => ({ value: p.id, label: p.label }));
  const siteOptions: FieldOption[] = [
    { value: NONE, label: t.noSite },
    ...options.sites
      .filter((s) => s.projectId === projectId)
      .map((s) => ({ value: s.id, label: s.label })),
  ];
  const codeChanged = originalCode !== null && normalizeEmployeeCode(code) !== originalCode;

  return (
    <>
      <FormSection
        title={t.sectionEmployee}
        description={originalCode === null ? t.codeAutoHint : undefined}
      >
        {fixedCompanyLabel === null ? (
          <SelectField<EmployeeFormValues>
            name="companyId"
            label={t.fieldCompany}
            options={companyOptions}
            placeholder={t.selectPlaceholder}
            description={t.fieldCompanyFixedHint}
            required
          />
        ) : (
          <FieldShell
            id="field-company-fixed"
            label={t.fieldCompany}
            description={t.fieldCompanyFixedHint}
          >
            <Input id="field-company-fixed" value={fixedCompanyLabel} readOnly disabled />
          </FieldShell>
        )}
        <TextField<EmployeeFormValues>
          name="code"
          label={t.fieldCode}
          description={t.fieldCodeHint}
          required
        />
        {codeChanged ? (
          <TextareaField<EmployeeFormValues>
            name="codeChangeRemarks"
            label={t.fieldCodeChangeRemarks}
            className="sm:col-span-2"
            rows={2}
            required
          />
        ) : null}
        <TextField<EmployeeFormValues> name="fullName" label={t.fieldName} required />
        <SelectField<EmployeeFormValues>
          name="designationId"
          label={t.fieldDesignation}
          options={designationOptions}
        />
        <DateField<EmployeeFormValues> name="dateOfJoining" label={t.fieldDateOfJoining} />
        <DateField<EmployeeFormValues>
          name="dateOfLeaving"
          label={t.fieldDateOfLeaving}
          description={t.fieldDateOfLeavingHint}
        />
      </FormSection>
      <FormSection title={t.sectionWork}>
        <SelectField<EmployeeFormValues>
          name="workLocationType"
          label={t.fieldWorkLocation}
          options={workLocationOptions}
        />
        {workLocationType === 'PROJECT' ? (
          <>
            <SelectField<EmployeeFormValues>
              name="projectId"
              label={t.fieldProject}
              options={projectOptions}
              placeholder={t.selectPlaceholder}
              required
            />
            <SelectField<EmployeeFormValues>
              name="siteId"
              label={t.fieldSite}
              options={siteOptions}
              description={t.fieldSiteHint}
            />
          </>
        ) : null}
      </FormSection>
      <FormSection title={t.sectionContact}>
        <TextField<EmployeeFormValues>
          name="officialEmail"
          label={t.fieldOfficialEmail}
          description={t.fieldOfficialEmailHint}
        />
        <TextField<EmployeeFormValues> name="mobile" label={t.fieldMobile} />
      </FormSection>
    </>
  );
}
