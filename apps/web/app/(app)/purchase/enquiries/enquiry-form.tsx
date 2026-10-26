'use client';

import {
  CreateEnquiryRequest,
  EnquiryIndentLineOptionsResponse,
  EnquiryVendorOptionsResponse,
  MAX_ENQUIRY_LINES,
  MAX_ENQUIRY_VENDORS,
  QUANTITY_PATTERN,
  UpdateEnquiryRequest,
  type EnquiryDetailResponse,
  type EnquiryFormOptionsResponse,
  type EnquiryResponse,
} from '@uie/contracts';
import { Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  DateField,
  FieldShell,
  FormLayout,
  FormSection,
  SelectField,
  TextareaField,
  type FieldOption,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { apiRead, apiRequest, messageForApiError } from '@/lib/api/client';
import { buildQueryString } from '@/lib/list-params';
import * as toast from '@/lib/toast';
import { codeName, indentLineRef, itemText } from './_components/enquiry-text';
import { RemotePicker } from './_components/remote-picker';

const t = terminology.enquiries;
const v = terminology.validation;

const EMPTY_LINE = { indentLineId: '', quantity: '', remarks: '' };

type IndentLineOption = EnquiryIndentLineOptionsResponse['lines'][number];
type VendorOption = EnquiryVendorOptionsResponse['vendors'][number];

interface LineMeta {
  label: string;
  unitCode: string;
  decimalPlaces: number;
  approvedQty: string;
}

type LineMetaMap = Record<string, LineMeta>;
type VendorLabelMap = Record<string, string>;

/** Today in IST (UTC+05:30), the same rule the API applies. */
function todayInIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Significant decimal places of a quantity string ("2.500" -> 1). */
function decimalsOf(value: string): number {
  return (value.split('.')[1] ?? '').replace(/0+$/, '').length;
}

function optionLabel(option: IndentLineOption): string {
  return `${indentLineRef(option.indentNumber, option.lineNo)}  ${itemText(option.item)}`;
}

/** Shows when the line is already on other enquiries (OQ-46). */
function optionHint(option: IndentLineOption): string | null {
  return option.enquiryCount > 0
    ? `${t.alreadyInPrefix} ${option.enquiryCount} ${t.alreadyInSuffix}`
    : null;
}

function lineError(index: number, message: string): string {
  return `${t.linePrefix} ${index + 1}: ${message}`;
}

async function loadIndentLines(siteId: string, search: string): Promise<IndentLineOption[] | null> {
  const result = await apiRead(
    `/api/enquiries/indent-line-options?${buildQueryString({ siteId, search })}`,
    EnquiryIndentLineOptionsResponse,
  );

  return result.ok ? result.data.lines : null;
}

async function loadVendors(search: string): Promise<VendorOption[] | null> {
  const query = buildQueryString({ search });
  const result = await apiRead(
    `/api/enquiries/vendor-options${query.length > 0 ? `?${query}` : ''}`,
    EnquiryVendorOptionsResponse,
  );

  return result.ok ? result.data.vendors : null;
}

// Form-level schema: the contract's rules with on-screen messages from terminology.
const schema = z
  .object({
    projectId: z.string().min(1, v.selectProject),
    siteId: z.string().min(1, v.selectSite),
    enquiryDate: z.string().min(1, v.required),
    quoteDueDate: z.string().min(1, v.required),
    terms: z.string().max(2000),
    remarks: z.string().max(500),
    lines: z
      .array(
        z.object({
          indentLineId: z.string().min(1, v.selectIndentLine),
          quantity: z
            .string()
            .trim()
            .regex(QUANTITY_PATTERN, v.invalidQuantity)
            .refine((value) => Number(value) > 0, v.invalidQuantity),
          remarks: z.string().max(300),
        }),
      )
      .min(1)
      .max(MAX_ENQUIRY_LINES),
    vendorIds: z.array(z.string()).min(1, v.selectVendor).max(MAX_ENQUIRY_VENDORS),
  })
  .superRefine((values, ctx) => {
    const seen = new Set<string>();

    values.lines.forEach((line, index) => {
      if (line.indentLineId.length > 0 && seen.has(line.indentLineId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'indentLineId'],
          message: v.indentLineRepeated,
        });
      }

      seen.add(line.indentLineId);
    });

    if (values.enquiryDate > todayInIst()) {
      ctx.addIssue({ code: 'custom', path: ['enquiryDate'], message: v.futureEnquiryDate });
    }

    if (values.quoteDueDate.length > 0 && values.quoteDueDate < values.enquiryDate) {
      ctx.addIssue({ code: 'custom', path: ['quoteDueDate'], message: v.quoteDueBeforeEnquiry });
    }
  });

type EnquiryFormValues = z.infer<typeof schema>;

/** The enquiry's own project/site stay selectable even if no longer in the option lists. */
function withExisting(
  options: EnquiryFormOptionsResponse,
  enquiry: EnquiryDetailResponse | undefined,
): EnquiryFormOptionsResponse {
  if (enquiry === undefined) {
    return options;
  }

  const projects = options.projects.some((p) => p.id === enquiry.project.id)
    ? options.projects
    : [
        {
          id: enquiry.project.id,
          label: codeName(enquiry.project.code, enquiry.project.name),
          companyId: enquiry.company.id,
        },
        ...options.projects,
      ];
  const sites = options.sites.some((s) => s.id === enquiry.site.id)
    ? options.sites
    : [
        {
          id: enquiry.site.id,
          label: codeName(enquiry.site.code, enquiry.site.name),
          projectId: enquiry.project.id,
        },
        ...options.sites,
      ];

  return { projects, sites };
}

export interface EnquiryFormProps {
  /** Present when editing; only drafts (canEdit) reach the form. */
  enquiry?: EnquiryDetailResponse;
  options: EnquiryFormOptionsResponse;
}

export function EnquiryForm({ enquiry, options }: EnquiryFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = enquiry !== undefined;
  const [formOptions] = useState(() => withExisting(options, enquiry));
  const [lineMeta, setLineMeta] = useState<LineMetaMap>(() =>
    Object.fromEntries(
      (enquiry?.lines ?? []).map((line) => [
        line.indentLine.id,
        {
          label: `${indentLineRef(line.indentLine.indentNumber, line.indentLine.lineNo)}  ${itemText(line.item)}`,
          unitCode: line.item.unitCode,
          decimalPlaces: line.item.decimalPlaces,
          approvedQty: line.indentLine.approvedQty,
        },
      ]),
    ),
  );
  const [vendorLabels, setVendorLabels] = useState<VendorLabelMap>(() =>
    Object.fromEntries(
      (enquiry?.vendors ?? []).map((vendor) => [
        vendor.id,
        codeName(vendor.code, vendor.legalName),
      ]),
    ),
  );

  const [defaults] = useState<EnquiryFormValues>(() => ({
    projectId:
      enquiry?.project.id ?? (options.projects.length === 1 ? (options.projects[0]?.id ?? '') : ''),
    siteId: enquiry?.site.id ?? '',
    enquiryDate: enquiry?.enquiryDate ?? todayInIst(),
    quoteDueDate: enquiry?.quoteDueDate ?? '',
    terms: enquiry?.terms ?? '',
    remarks: enquiry?.remarks ?? '',
    lines:
      enquiry === undefined
        ? [EMPTY_LINE]
        : enquiry.lines.map((line) => ({
            indentLineId: line.indentLine.id,
            quantity: line.quantity,
            remarks: line.remarks ?? '',
          })),
    vendorIds: enquiry?.vendors.map((vendor) => vendor.id) ?? [],
  }));

  async function handleSubmit(values: EnquiryFormValues): Promise<void> {
    setErrorMessage(null);

    for (const [index, line] of values.lines.entries()) {
      const meta = lineMeta[line.indentLineId];

      if (meta === undefined) {
        continue;
      }

      if (decimalsOf(line.quantity) > meta.decimalPlaces) {
        setErrorMessage(lineError(index, `${t.tooManyDecimals} ${meta.decimalPlaces}`));
        return;
      }

      if (Number(line.quantity) > Number(meta.approvedQty)) {
        setErrorMessage(lineError(index, v.quantityAboveApproved));
        return;
      }
    }

    // Blank optional fields become null in the contract schemas.
    const body = {
      siteId: values.siteId,
      enquiryDate: values.enquiryDate,
      quoteDueDate: values.quoteDueDate,
      terms: values.terms,
      remarks: values.remarks,
      lines: values.lines,
      vendorIds: values.vendorIds,
    };

    if (isEdit) {
      const checked = UpdateEnquiryRequest.safeParse(body);

      if (!checked.success) {
        setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
        return;
      }

      const result = await apiRequest('PATCH', `/api/enquiries/${enquiry.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(messageForApiError(result.code));
        return;
      }

      toast.success(t.updated);
      router.push(`/purchase/enquiries/${enquiry.id}`);
      return;
    }

    const checked = CreateEnquiryRequest.safeParse({ ...body, projectId: values.projectId });

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = await apiRequest<EnquiryResponse>('POST', '/api/enquiries', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/purchase/enquiries/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<EnquiryFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(isEdit ? `/purchase/enquiries/${enquiry.id}` : '/purchase/enquiries')
        }
      >
        <FormSection title={t.sectionHeader}>
          <EnquiryHeaderFields
            options={formOptions}
            fixedProjectLabel={isEdit ? codeName(enquiry.project.code, enquiry.project.name) : null}
          />
        </FormSection>
        <FormSection title={t.sectionLines} columns={1}>
          <EnquiryLinesEditor
            lineMeta={lineMeta}
            onLineChosen={(option) =>
              setLineMeta((previous) => ({
                ...previous,
                [option.indentLineId]: {
                  label: optionLabel(option),
                  unitCode: option.item.unitCode,
                  decimalPlaces: option.item.decimalPlaces,
                  approvedQty: option.approvedQty,
                },
              }))
            }
          />
        </FormSection>
        <FormSection title={t.sectionVendors} columns={1}>
          <EnquiryVendorsEditor
            vendorLabels={vendorLabels}
            onVendorChosen={(option) =>
              setVendorLabels((previous) => ({ ...previous, [option.id]: option.label }))
            }
          />
        </FormSection>
      </FormLayout>
    </div>
  );
}

function EnquiryHeaderFields({
  options,
  fixedProjectLabel,
}: {
  options: EnquiryFormOptionsResponse;
  /** Set when editing: the project is fixed at creation. */
  fixedProjectLabel: string | null;
}) {
  const { control, getValues, setValue } = useFormContext<EnquiryFormValues>();
  const projectId = useWatch({ control, name: 'projectId' });

  // A site must belong to the project; picks the only site automatically.
  useEffect(() => {
    const sites = options.sites.filter((site) => site.projectId === projectId);

    if (!sites.some((site) => site.id === getValues('siteId'))) {
      setValue('siteId', sites.length === 1 ? (sites[0]?.id ?? '') : '');
    }
  }, [projectId, options, getValues, setValue]);

  const projectOptions: FieldOption[] = options.projects.map((p) => ({
    value: p.id,
    label: p.label,
  }));
  const siteOptions: FieldOption[] = options.sites
    .filter((site) => site.projectId === projectId)
    .map((site) => ({ value: site.id, label: site.label }));

  return (
    <>
      {fixedProjectLabel === null ? (
        <SelectField<EnquiryFormValues>
          name="projectId"
          label={t.fieldProject}
          options={projectOptions}
          placeholder={t.selectPlaceholder}
          required
        />
      ) : (
        <FieldShell
          id="field-project-fixed"
          label={t.fieldProject}
          description={t.fieldProjectFixedHint}
        >
          <Input id="field-project-fixed" value={fixedProjectLabel} readOnly disabled />
        </FieldShell>
      )}
      <SelectField<EnquiryFormValues>
        name="siteId"
        label={t.fieldSite}
        options={siteOptions}
        placeholder={t.selectPlaceholder}
        description={t.fieldSiteHint}
        required
      />
      <DateField<EnquiryFormValues> name="enquiryDate" label={t.fieldEnquiryDate} required />
      <DateField<EnquiryFormValues> name="quoteDueDate" label={t.fieldQuoteDueDate} required />
      <TextareaField<EnquiryFormValues>
        name="terms"
        label={t.fieldTerms}
        description={t.fieldTermsHint}
        className="sm:col-span-2"
        rows={3}
      />
      <TextareaField<EnquiryFormValues>
        name="remarks"
        label={t.fieldRemarks}
        className="sm:col-span-2"
        rows={2}
      />
    </>
  );
}

function EnquiryLinesEditor({
  lineMeta,
  onLineChosen,
}: {
  lineMeta: LineMetaMap;
  onLineChosen: (option: IndentLineOption) => void;
}) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EnquiryFormValues>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });
  const siteId = useWatch({ control, name: 'siteId' });
  const previousSite = useRef(siteId);

  // Lines belong to the site (OQ-51): a different site starts the lines again.
  useEffect(() => {
    if (previousSite.current !== siteId) {
      previousSite.current = siteId;
      replace([EMPTY_LINE]);
    }
  }, [siteId, replace]);

  const noSite = siteId.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-240 text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
              <th className="min-w-[24rem] px-2 py-2 font-medium">{t.columnIndentLine}</th>
              <th className="w-20 px-2 py-2 font-medium">{t.columnUnit}</th>
              <th className="w-32 px-2 py-2 text-right font-medium">{t.columnApprovedQty}</th>
              <th className="w-36 px-2 py-2 font-medium">{t.columnQuantity}</th>
              <th className="px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              <th className="w-12 px-2 py-2" aria-label={t.removeLine} />
            </tr>
          </thead>
          <tbody>
            {fields.map((row, index) => {
              const rowErrors = errors.lines?.[index];
              const meta = lineMeta[lines[index]?.indentLineId ?? ''];

              return (
                <tr key={row.id} className="border-b border-border align-top">
                  <td className="px-2 py-3">{index + 1}</td>
                  <td className="px-2 py-2">
                    <Controller
                      control={control}
                      name={`lines.${index}.indentLineId`}
                      render={({ field }) => (
                        <RemotePicker<IndentLineOption>
                          id={`line-${index}-indent-line`}
                          placeholder={noSite ? t.chooseSiteFirst : t.selectIndentLine}
                          selectedLabel={lineMeta[field.value]?.label ?? null}
                          unavailableText={t.indentLinesUnavailable}
                          load={(search) => loadIndentLines(siteId, search)}
                          optionKey={(option) => option.indentLineId}
                          optionLabel={optionLabel}
                          optionHint={optionHint}
                          isSelected={(option) => option.indentLineId === field.value}
                          reloadKey={siteId}
                          disabled={noSite}
                          invalid={rowErrors?.indentLineId !== undefined}
                          onSelect={(option) => {
                            onLineChosen(option);
                            field.onChange(option.indentLineId);
                            field.onBlur();

                            // Start from the approved quantity; it may be lowered (OQ-47).
                            if (getValues(`lines.${index}.quantity`).trim().length === 0) {
                              setValue(`lines.${index}.quantity`, option.approvedQty, {
                                shouldDirty: true,
                              });
                            }
                          }}
                        />
                      )}
                    />
                    {rowErrors?.indentLineId?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.indentLineId.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3">{meta?.unitCode ?? terminology.labels.notSet}</td>
                  <td className="px-2 py-3 text-right">
                    {meta?.approvedQty ?? terminology.labels.notSet}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnQuantity}
                      aria-invalid={rowErrors?.quantity !== undefined}
                      {...register(`lines.${index}.quantity`)}
                    />
                    {rowErrors?.quantity?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.quantity.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label={t.columnLineRemarks}
                      {...register(`lines.${index}.remarks`)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.removeLine}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={noSite || fields.length >= MAX_ENQUIRY_LINES}
          onClick={() => append(EMPTY_LINE)}
        >
          <Plus className="size-4" aria-hidden />
          {t.addLine}
        </Button>
      </div>
    </div>
  );
}

function EnquiryVendorsEditor({
  vendorLabels,
  onVendorChosen,
}: {
  vendorLabels: VendorLabelMap;
  onVendorChosen: (option: VendorOption) => void;
}) {
  const { control } = useFormContext<EnquiryFormValues>();

  return (
    <Controller
      control={control}
      name="vendorIds"
      render={({ field, fieldState }) => {
        const chosen = field.value;

        return (
          <div className="flex flex-col gap-3">
            {chosen.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noVendors}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {chosen.map((vendorId) => (
                  <li key={vendorId} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm">
                      {vendorLabels[vendorId] ?? terminology.labels.notSet}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.removeVendor}
                      onClick={() => {
                        field.onChange(chosen.filter((id) => id !== vendorId));
                        field.onBlur();
                      }}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="max-w-md">
              <RemotePicker<VendorOption>
                id="field-add-vendor"
                placeholder={t.addVendor}
                selectedLabel={null}
                unavailableText={t.vendorsUnavailable}
                load={loadVendors}
                optionKey={(option) => option.id}
                optionLabel={(option) => option.label}
                isSelected={(option) => chosen.includes(option.id)}
                disabled={chosen.length >= MAX_ENQUIRY_VENDORS}
                invalid={fieldState.error !== undefined}
                onSelect={(option) => {
                  onVendorChosen(option);

                  if (!chosen.includes(option.id)) {
                    field.onChange([...chosen, option.id]);
                  }

                  field.onBlur();
                }}
              />
            </div>
            {fieldState.error?.message ? (
              <p className="text-xs text-danger">{fieldState.error.message}</p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
