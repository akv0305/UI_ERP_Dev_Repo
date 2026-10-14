'use client';

import {
  CreateItemRequest,
  GST_RATE_PATTERN,
  HSN_PATTERN,
  ITEM_USES,
  MAX_GST_RATE,
  UpdateItemRequest,
  type ItemResponse,
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
import * as toast from '@/lib/toast';

const schema = z.object({
  description: z.string().trim().min(1, terminology.validation.required).max(300),
  size: z.string().trim().max(200),
  categoryId: z.string().min(1, terminology.validation.selectCategory),
  unitId: z.string().min(1, terminology.validation.selectUnit),
  itemUse: z.enum(ITEM_USES),
  hsnCode: z
    .string()
    .trim()
    .refine((value) => value === '' || HSN_PATTERN.test(value), terminology.validation.invalidHsn),
  gstRate: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (GST_RATE_PATTERN.test(value) && Number(value) <= MAX_GST_RATE),
      terminology.validation.invalidGstRate,
    ),
  remarks: z.string().trim().max(500),
});

type ItemFormValues = z.infer<typeof schema>;

const USE_OPTIONS: FieldOption[] = ITEM_USES.map((use) => ({
  value: use,
  label: terminology.items.uses[use],
}));

export interface ItemFormProps {
  /** Present when editing; only Draft or Rejected items reach the form (canEdit). */
  item?: ItemResponse;
  categoryOptions: FieldOption[];
  unitOptions: FieldOption[];
}

export function ItemForm({ item, categoryOptions, unitOptions }: ItemFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = item !== undefined;

  const [defaults] = useState<ItemFormValues>(() => ({
    description: item?.description ?? '',
    size: item?.size ?? '',
    categoryId: item?.category.id ?? '',
    unitId: item?.unit.id ?? '',
    itemUse: item?.itemUse ?? 'STOCK_AND_ISSUE',
    hsnCode: item?.hsnCode ?? '',
    gstRate: item?.gstRate ?? '',
    remarks: item?.remarks ?? '',
  }));

  async function handleSubmit(values: ItemFormValues): Promise<void> {
    setErrorMessage(null);

    // Blank optional fields become null in the contract schemas.
    const checked = isEdit
      ? UpdateItemRequest.safeParse(values)
      : CreateItemRequest.safeParse(values);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    if (isEdit) {
      const result = await apiRequest('PATCH', `/api/items/${item.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(messageForApiError(result.code));
        return;
      }

      toast.success(terminology.items.updated);
      router.refresh();
      return;
    }

    const result = await apiRequest<ItemResponse>('POST', '/api/items', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(terminology.items.created);
    router.push(`/masters/items/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<ItemFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() => router.push(isEdit ? `/masters/items/${item.id}` : '/masters/items')}
      >
        <FormSection title={terminology.items.sectionItem}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField<ItemFormValues>
              name="description"
              label={terminology.items.fieldDescription}
              description={isEdit ? undefined : terminology.items.codeAutoHint}
              className="md:col-span-2"
              required
            />
            <TextField<ItemFormValues>
              name="size"
              label={terminology.items.fieldSize}
              description={terminology.items.fieldSizeHint}
              className="md:col-span-2"
            />
            <SelectField<ItemFormValues>
              name="categoryId"
              label={terminology.items.fieldCategory}
              options={categoryOptions}
              placeholder={terminology.validation.selectCategory}
              required
            />
            <SelectField<ItemFormValues>
              name="unitId"
              label={terminology.items.fieldUnit}
              options={unitOptions}
              placeholder={terminology.validation.selectUnit}
              required
            />
            <SelectField<ItemFormValues>
              name="itemUse"
              label={terminology.items.fieldUse}
              description={terminology.items.fieldUseHint}
              options={USE_OPTIONS}
              required
            />
          </div>
        </FormSection>
        <FormSection title={terminology.items.sectionTax}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField<ItemFormValues>
              name="hsnCode"
              label={terminology.items.fieldHsn}
              description={terminology.items.fieldHsnHint}
            />
            <TextField<ItemFormValues>
              name="gstRate"
              label={terminology.items.fieldGstRate}
              description={terminology.items.fieldGstRateHint}
            />
            <TextareaField<ItemFormValues>
              name="remarks"
              label={terminology.items.fieldRemarks}
              className="md:col-span-2"
              rows={3}
            />
          </div>
        </FormSection>
      </FormLayout>
    </div>
  );
}
