'use client';

import {
  CreateIndentRequest,
  MAX_INDENT_LINES,
  QUANTITY_PATTERN,
  UpdateIndentRequest,
  type IndentDetailResponse,
  type IndentFormOptionsResponse,
  type IndentResponse,
} from '@uie/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { ItemPicker, type IndentItemOption } from './_components/item-picker';

const t = terminology.indents;
const v = terminology.validation;

/** Select value for "no store"; sent as blank, which the contract turns into null. */
const NO_STORE_VALUE = 'none';
const EMPTY_LINE = { itemId: '', requiredQty: '', purpose: '', remarks: '' };

type ItemMeta = Pick<IndentItemOption, 'label' | 'unitCode' | 'decimalPlaces'>;
type ItemMetaMap = Record<string, ItemMeta>;

/** Today in IST (UTC+05:30) as YYYY-MM-DD, the same rule the API applies (OQ-43 a). */
function todayInIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Significant decimal places of a quantity string ("2.500" -> 1). */
function decimalsOf(value: string): number {
  return (value.split('.')[1] ?? '').replace(/0+$/, '').length;
}

function codeName(code: string, name: string): string {
  return `${code}  ${name}`;
}

function itemLabel(item: IndentDetailResponse['lines'][number]['item']): string {
  return codeName(
    item.code,
    item.size === null ? item.description : `${item.description}, ${item.size}`,
  );
}

// Form-level schema: the contract's rules with on-screen messages from terminology.
const schema = z
  .object({
    projectId: z.string().min(1, v.selectProject),
    siteId: z.string().min(1, v.selectSite),
    storeId: z.string(),
    indentDate: z.string().min(1, v.required),
    requiredByDate: z.string(),
    requestedBy: z.string().trim().min(1, v.required).max(120),
    remarks: z.string().max(500),
    lines: z
      .array(
        z.object({
          itemId: z.string().min(1, v.selectItem),
          requiredQty: z
            .string()
            .trim()
            .regex(QUANTITY_PATTERN, v.invalidQuantity)
            .refine((value) => Number(value) > 0, v.invalidQuantity),
          purpose: z.string().max(300),
          remarks: z.string().max(300),
        }),
      )
      .min(1)
      .max(MAX_INDENT_LINES),
  })
  .superRefine((values, ctx) => {
    const seen = new Set<string>();

    values.lines.forEach((line, index) => {
      if (line.itemId.length > 0 && seen.has(line.itemId)) {
        ctx.addIssue({ code: 'custom', path: ['lines', index, 'itemId'], message: v.itemRepeated });
      }

      seen.add(line.itemId);
    });

    if (values.indentDate > todayInIst()) {
      ctx.addIssue({ code: 'custom', path: ['indentDate'], message: v.futureIndentDate });
    }

    if (values.requiredByDate.length > 0 && values.requiredByDate < values.indentDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['requiredByDate'],
        message: v.requiredByBeforeIndent,
      });
    }
  });

type IndentFormValues = z.infer<typeof schema>;

/** The indent's own project/site/store stay selectable even if no longer in the option lists. */
function withExisting(
  options: IndentFormOptionsResponse,
  indent: IndentDetailResponse | undefined,
): IndentFormOptionsResponse {
  if (indent === undefined) {
    return options;
  }

  const projects = options.projects.some((p) => p.id === indent.project.id)
    ? options.projects
    : [
        {
          id: indent.project.id,
          label: codeName(indent.project.code, indent.project.name),
          companyId: indent.company.id,
        },
        ...options.projects,
      ];
  const sites = options.sites.some((s) => s.id === indent.site.id)
    ? options.sites
    : [
        {
          id: indent.site.id,
          label: codeName(indent.site.code, indent.site.name),
          projectId: indent.project.id,
        },
        ...options.sites,
      ];
  const store = indent.store;
  const stores =
    store === null || options.stores.some((s) => s.id === store.id)
      ? options.stores
      : [
          { id: store.id, label: codeName(store.code, store.name), siteId: indent.site.id },
          ...options.stores,
        ];

  return { projects, sites, stores };
}

export interface IndentFormProps {
  /** Present when editing; only indents with canEdit (Draft or Rejected) reach the form. */
  indent?: IndentDetailResponse;
  options: IndentFormOptionsResponse;
}

export function IndentForm({ indent, options }: IndentFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = indent !== undefined;
  const [formOptions] = useState(() => withExisting(options, indent));
  const [itemMeta, setItemMeta] = useState<ItemMetaMap>(() =>
    Object.fromEntries(
      (indent?.lines ?? []).map((line) => [
        line.item.id,
        {
          label: itemLabel(line.item),
          unitCode: line.item.unitCode,
          decimalPlaces: line.item.decimalPlaces,
        },
      ]),
    ),
  );

  const [defaults] = useState<IndentFormValues>(() => ({
    projectId:
      indent?.project.id ?? (options.projects.length === 1 ? (options.projects[0]?.id ?? '') : ''),
    siteId: indent?.site.id ?? '',
    storeId: indent?.store?.id ?? NO_STORE_VALUE,
    indentDate: indent?.indentDate ?? todayInIst(),
    requiredByDate: indent?.requiredByDate ?? '',
    requestedBy: indent?.requestedBy ?? '',
    remarks: indent?.remarks ?? '',
    lines:
      indent === undefined
        ? [EMPTY_LINE]
        : indent.lines.map((line) => ({
            itemId: line.item.id,
            requiredQty: line.requiredQty,
            purpose: line.purpose ?? '',
            remarks: line.remarks ?? '',
          })),
  }));

  async function handleSubmit(values: IndentFormValues): Promise<void> {
    setErrorMessage(null);

    for (const [index, line] of values.lines.entries()) {
      const meta = itemMeta[line.itemId];

      if (meta !== undefined && decimalsOf(line.requiredQty) > meta.decimalPlaces) {
        setErrorMessage(`${t.linePrefix} ${index + 1}: ${t.tooManyDecimals} ${meta.decimalPlaces}`);
        return;
      }
    }

    // Blank optional fields become null in the contract schemas.
    const body = {
      siteId: values.siteId,
      storeId: values.storeId === NO_STORE_VALUE ? '' : values.storeId,
      indentDate: values.indentDate,
      requiredByDate: values.requiredByDate,
      requestedBy: values.requestedBy,
      remarks: values.remarks,
      lines: values.lines,
    };

    if (isEdit) {
      const checked = UpdateIndentRequest.safeParse(body);

      if (!checked.success) {
        setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
        return;
      }

      const result = await apiRequest('PATCH', `/api/indents/${indent.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(messageForApiError(result.code));
        return;
      }

      toast.success(t.updated);
      router.push(`/purchase/indents/${indent.id}`);
      return;
    }

    const checked = CreateIndentRequest.safeParse({ ...body, projectId: values.projectId });

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = await apiRequest<IndentResponse>('POST', '/api/indents', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/purchase/indents/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<IndentFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(isEdit ? `/purchase/indents/${indent.id}` : '/purchase/indents')
        }
      >
        <FormSection title={t.sectionHeader}>
          <IndentHeaderFields
            options={formOptions}
            fixedProjectLabel={isEdit ? codeName(indent.project.code, indent.project.name) : null}
          />
        </FormSection>
        <FormSection title={t.sectionLines} columns={1}>
          <IndentLinesEditor
            itemMeta={itemMeta}
            onItemChosen={(option) =>
              setItemMeta((previous) => ({
                ...previous,
                [option.id]: {
                  label: option.label,
                  unitCode: option.unitCode,
                  decimalPlaces: option.decimalPlaces,
                },
              }))
            }
          />
        </FormSection>
      </FormLayout>
    </div>
  );
}

function IndentHeaderFields({
  options,
  fixedProjectLabel,
}: {
  options: IndentFormOptionsResponse;
  /** Set when editing: the project is fixed at creation. */
  fixedProjectLabel: string | null;
}) {
  const { control, getValues, setValue } = useFormContext<IndentFormValues>();
  const projectId = useWatch({ control, name: 'projectId' });
  const siteId = useWatch({ control, name: 'siteId' });

  // A site must belong to the project; picks the only site automatically.
  useEffect(() => {
    const sites = options.sites.filter((site) => site.projectId === projectId);

    if (!sites.some((site) => site.id === getValues('siteId'))) {
      setValue('siteId', sites.length === 1 ? (sites[0]?.id ?? '') : '');
    }
  }, [projectId, options, getValues, setValue]);

  // A store must belong to the site.
  useEffect(() => {
    const current = getValues('storeId');

    if (
      current !== NO_STORE_VALUE &&
      !options.stores.some((store) => store.id === current && store.siteId === siteId)
    ) {
      setValue('storeId', NO_STORE_VALUE);
    }
  }, [siteId, options, getValues, setValue]);

  const projectOptions: FieldOption[] = options.projects.map((p) => ({
    value: p.id,
    label: p.label,
  }));
  const siteOptions: FieldOption[] = options.sites
    .filter((site) => site.projectId === projectId)
    .map((site) => ({ value: site.id, label: site.label }));
  const storeOptions: FieldOption[] = [
    { value: NO_STORE_VALUE, label: t.noStore },
    ...options.stores
      .filter((store) => store.siteId === siteId)
      .map((store) => ({ value: store.id, label: store.label })),
  ];

  return (
    <>
      {fixedProjectLabel === null ? (
        <SelectField<IndentFormValues>
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
      <SelectField<IndentFormValues>
        name="siteId"
        label={t.fieldSite}
        options={siteOptions}
        placeholder={t.selectPlaceholder}
        required
      />
      <SelectField<IndentFormValues>
        name="storeId"
        label={t.fieldStore}
        options={storeOptions}
        description={t.fieldStoreHint}
      />
      <TextField<IndentFormValues> name="requestedBy" label={t.fieldRequestedBy} required />
      <DateField<IndentFormValues> name="indentDate" label={t.fieldIndentDate} required />
      <DateField<IndentFormValues> name="requiredByDate" label={t.fieldRequiredByDate} />
      <TextareaField<IndentFormValues>
        name="remarks"
        label={t.fieldRemarks}
        className="sm:col-span-2"
        rows={2}
      />
    </>
  );
}

function IndentLinesEditor({
  itemMeta,
  onItemChosen,
}: {
  itemMeta: ItemMetaMap;
  onItemChosen: (option: IndentItemOption) => void;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<IndentFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-240 text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
              <th className="min-w-[20rem] px-2 py-2 font-medium">{t.columnItem}</th>
              <th className="w-20 px-2 py-2 font-medium">{t.columnUnit}</th>
              <th className="w-36 px-2 py-2 font-medium">{t.columnRequiredQty}</th>
              <th className="px-2 py-2 font-medium">{t.columnPurpose}</th>
              <th className="px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              <th className="w-12 px-2 py-2" aria-label={t.removeLine} />
            </tr>
          </thead>
          <tbody>
            {fields.map((row, index) => {
              const rowErrors = errors.lines?.[index];
              const meta = itemMeta[lines[index]?.itemId ?? ''];

              return (
                <tr key={row.id} className="border-b border-border align-top">
                  <td className="px-2 py-3">{index + 1}</td>
                  <td className="px-2 py-2">
                    <Controller
                      control={control}
                      name={`lines.${index}.itemId`}
                      render={({ field }) => (
                        <ItemPicker
                          id={`line-${index}-item`}
                          value={field.value}
                          selectedLabel={itemMeta[field.value]?.label ?? null}
                          invalid={rowErrors?.itemId !== undefined}
                          onSelect={(option) => {
                            onItemChosen(option);
                            field.onChange(option.id);
                            field.onBlur();
                          }}
                        />
                      )}
                    />
                    {rowErrors?.itemId?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.itemId.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3">{meta?.unitCode ?? terminology.labels.notSet}</td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnRequiredQty}
                      aria-invalid={rowErrors?.requiredQty !== undefined}
                      {...register(`lines.${index}.requiredQty`)}
                    />
                    {rowErrors?.requiredQty?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.requiredQty.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input aria-label={t.columnPurpose} {...register(`lines.${index}.purpose`)} />
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
          disabled={fields.length >= MAX_INDENT_LINES}
          onClick={() => append(EMPTY_LINE)}
        >
          <Plus className="size-4" aria-hidden />
          {t.addLine}
        </Button>
      </div>
    </div>
  );
}
