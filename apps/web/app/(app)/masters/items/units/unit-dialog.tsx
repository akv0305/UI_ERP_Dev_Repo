'use client';

import {
  CreateUnitRequest,
  MAX_UNIT_DECIMALS,
  UpdateUnitRequest,
  isValidMasterCode,
  type UnitResponse,
} from '@uie/contracts';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, NumberField, TextField } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

const DECIMALS_PATTERN = new RegExp(`^[0-${MAX_UNIT_DECIMALS}]$`);

const baseShape = {
  name: z.string().trim().min(1, terminology.validation.required).max(60),
  decimalPlaces: z
    .string()
    .trim()
    .regex(DECIMALS_PATTERN, terminology.validation.invalidUnitDecimals),
};

const createSchema = z.object({
  ...baseShape,
  code: z.string().refine(isValidMasterCode, terminology.validation.invalidCode),
});
// The code field is disabled when editing, and react-hook-form leaves disabled values out.
const editSchema = z.object({
  ...baseShape,
  code: z.string().optional(),
});

type UnitFormValues = z.infer<typeof createSchema>;

export interface UnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing unit. */
  unit?: UnitResponse;
  onSaved: () => void;
}

export function UnitDialog({ open, onOpenChange, unit, onSaved }: UnitDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = unit !== undefined;

  // Defaults are only read when the form mounts (the dialog is keyed by unit id).
  const [defaults] = useState<UnitFormValues>(() => ({
    code: unit?.code ?? '',
    name: unit?.name ?? '',
    decimalPlaces: String(unit?.decimalPlaces ?? 0),
  }));

  async function handleSubmit(values: UnitFormValues): Promise<void> {
    setErrorMessage(null);

    const payload = {
      code: isEdit ? unit.code : values.code,
      name: values.name,
      decimalPlaces: Number(values.decimalPlaces),
    };
    // Validate once more against the real API contract before sending.
    const checked = isEdit
      ? UpdateUnitRequest.safeParse(payload)
      : CreateUnitRequest.safeParse(payload);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/units/${unit.id}`, checked.data)
      : await apiRequest('POST', '/api/units', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? terminology.units.updated : terminology.units.created);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="mb-3 space-y-1">
          <DialogTitle>
            {isEdit ? terminology.units.editTitle : terminology.units.addTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {terminology.itemMaster.tabUnits}
          </DialogDescription>
        </div>
        {errorMessage === null ? null : (
          <p role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <FormLayout<UnitFormValues>
          schema={isEdit ? (editSchema as unknown as typeof createSchema) : createSchema}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        >
          <div className="grid gap-4">
            <TextField<UnitFormValues>
              name="code"
              label={terminology.units.fieldCode}
              description={terminology.units.fieldCodeHint}
              disabled={isEdit}
              required
            />
            <TextField<UnitFormValues> name="name" label={terminology.units.fieldName} required />
            <NumberField<UnitFormValues>
              name="decimalPlaces"
              label={terminology.units.fieldDecimals}
              description={terminology.units.fieldDecimalsHint}
              required
            />
          </div>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
