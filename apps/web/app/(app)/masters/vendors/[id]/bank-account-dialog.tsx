'use client';

import {
  BANK_ACCOUNT_PATTERN,
  CreateVendorBankAccountRequest,
  IFSC_PATTERN,
  normalizeIdentifier,
  type VendorBankAccountResponse,
} from '@uie/contracts';
import { useState } from 'react';
import { z } from 'zod';
import { FormLayout, SwitchField, TextField } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import * as toast from '@/lib/toast';

const t = terminology.vendorBank;
const v = terminology.validation;

const schema = z.object({
  accountName: z.string().trim().min(1, v.required).max(200),
  accountNumber: z
    .string()
    .refine((value) => BANK_ACCOUNT_PATTERN.test(value.trim()), v.invalidBankAccount),
  ifsc: z.string().refine((value) => IFSC_PATTERN.test(normalizeIdentifier(value)), v.invalidIfsc),
  bankName: z.string().trim().min(1, v.required).max(120),
  branchName: z.string().max(120),
  isPrimary: z.boolean(),
});

type BankFormValues = z.infer<typeof schema>;

export interface BankAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  /** Present when editing; only managers edit, and they receive the full number. */
  account?: VendorBankAccountResponse;
  onSaved: () => void;
}

export function BankAccountDialog({
  open,
  onOpenChange,
  vendorId,
  account,
  onSaved,
}: BankAccountDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEdit = account !== undefined;

  const [defaults] = useState<BankFormValues>(() => ({
    accountName: account?.accountName ?? '',
    accountNumber: account?.accountNumber ?? '',
    ifsc: account?.ifsc ?? '',
    bankName: account?.bankName ?? '',
    branchName: account?.branchName ?? '',
    isPrimary: account?.isPrimary ?? false,
  }));

  async function handleSubmit(values: BankFormValues): Promise<void> {
    setErrorMessage(null);

    const checked = CreateVendorBankAccountRequest.safeParse(values);

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = isEdit
      ? await apiRequest('PATCH', `/api/vendor-bank-accounts/${account.id}`, checked.data)
      : await apiRequest('POST', `/api/vendors/${vendorId}/bank-accounts`, checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(isEdit ? t.updated : t.created);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="mb-3 space-y-1">
          <DialogTitle>{isEdit ? t.editTitle : t.addTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.title}</DialogDescription>
        </div>
        {errorMessage === null ? null : (
          <p role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <FormLayout<BankFormValues>
          schema={schema}
          defaultValues={defaults}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField<BankFormValues>
              name="accountName"
              label={t.fieldAccountName}
              className="sm:col-span-2"
              required
            />
            <TextField<BankFormValues>
              name="accountNumber"
              label={t.fieldAccountNumber}
              description={t.fieldAccountNumberHint}
              required
            />
            <TextField<BankFormValues>
              name="ifsc"
              label={t.fieldIfsc}
              description={t.fieldIfscHint}
              required
            />
            <TextField<BankFormValues> name="bankName" label={t.fieldBankName} required />
            <TextField<BankFormValues> name="branchName" label={t.fieldBranchName} />
            <SwitchField<BankFormValues>
              name="isPrimary"
              label={t.fieldPrimary}
              description={t.fieldPrimaryHint}
              className="sm:col-span-2"
            />
          </div>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
