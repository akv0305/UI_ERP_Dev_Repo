'use client';

import {
  CreateQuotationRequest,
  QUOTATION_AMOUNT_PATTERN,
  QUOTATION_CHARGE_TYPES,
  QUOTATION_PERCENT_PATTERN,
  QUOTATION_RATE_PATTERN,
  UpdateQuotationRequest,
  type EnquiryItemSummary,
  type QuotationDetailResponse,
  type QuotationEnquiryFormResponse,
  type QuotationResponse,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  DateField,
  FieldShell,
  FormLayout,
  FormSection,
  KeyValueGrid,
  SelectField,
  TextField,
  TextareaField,
  type FieldOption,
} from '@/components/erp';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { apiRequest, messageForApiError } from '@/lib/api/client';
import { formatINR, formatQty } from '@/lib/format';
import { quotationTotals, type TotalsLine } from '@/lib/quotation-totals';
import * as toast from '@/lib/toast';
import { cn } from '@/lib/utils';
import { codeName, itemText } from '../enquiries/_components/enquiry-text';

const t = terminology.quotations;
const v = terminology.validation;
const notSet = terminology.labels.notSet;

/** Today in IST (UTC+05:30), the same rule the API applies (OQ-58 a). */
function todayInIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

const optionalPattern = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value.length === 0 || pattern.test(value), message);

const optionalPercent = (message: string) =>
  optionalPattern(QUOTATION_PERCENT_PATTERN, message).refine(
    (value) => value.length === 0 || Number(value) <= 100,
    message,
  );

const optionalDays = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || (/^\d{1,3}$/.test(value) && Number(value) <= 365),
    v.invalidPaymentTerms,
  );

const schema = z
  .object({
    vendorId: z.string().min(1, v.selectQuoteVendor),
    vendorQuoteRef: z.string().max(60),
    quoteDate: z.string().min(1, v.required),
    validUntil: z.string(),
    deliveryDays: optionalDays,
    paymentTermsDays: optionalDays,
    remarks: z.string().max(500),
    lines: z.array(
      z.object({
        enquiryLineId: z.string(),
        isQuoted: z.boolean(),
        rate: optionalPattern(QUOTATION_RATE_PATTERN, v.invalidRate),
        discountPercent: optionalPercent(v.invalidPercent),
        gstRate: optionalPercent(v.invalidGstRate),
        makeBrand: z.string().max(120),
        remarks: z.string().max(300),
      }),
    ),
    charges: z.array(
      z.object({
        chargeType: z.enum(QUOTATION_CHARGE_TYPES),
        description: z.string().max(120),
        amount: optionalPattern(QUOTATION_AMOUNT_PATTERN, v.invalidAmount),
        gstRate: optionalPercent(v.invalidGstRate),
      }),
    ),
  })
  .superRefine((values, ctx) => {
    values.lines.forEach((line, index) => {
      if (!line.isQuoted) {
        return;
      }

      if (line.rate.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['lines', index, 'rate'], message: v.required });
      }

      if (line.gstRate.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['lines', index, 'gstRate'], message: v.required });
      }
    });

    values.charges.forEach((charge, index) => {
      if (charge.amount.length === 0) {
        return;
      }

      if (charge.gstRate.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['charges', index, 'gstRate'], message: v.required });
      }

      if (charge.chargeType === 'OTHER' && charge.description.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['charges', index, 'description'],
          message: v.describeOtherCharge,
        });
      }
    });

    if (values.quoteDate > todayInIst()) {
      ctx.addIssue({ code: 'custom', path: ['quoteDate'], message: v.futureQuoteDate });
    }

    if (values.validUntil.length > 0 && values.validUntil < values.quoteDate) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: v.validUntilBeforeQuote });
    }
  });

type QuotationFormValues = z.infer<typeof schema>;

/** One fixed row per enquiry line. */
interface QuotationRow {
  enquiryLineId: string;
  lineNo: number;
  item: EnquiryItemSummary;
  quantity: string;
}

function totalsLines(
  rows: readonly QuotationRow[],
  lines: QuotationFormValues['lines'],
): TotalsLine[] {
  return rows.map((row, index) => {
    const line = lines[index];

    return {
      isQuoted: line?.isQuoted ?? false,
      quantity: row.quantity,
      rate: line?.rate ?? '',
      discountPercent: line?.discountPercent ?? '',
      gstRate: line?.gstRate ?? '',
    };
  });
}

function emptyCharges(): QuotationFormValues['charges'] {
  return QUOTATION_CHARGE_TYPES.map((chargeType) => ({
    chargeType,
    description: '',
    amount: '',
    gstRate: '',
  }));
}

function createDefaults(
  form: QuotationEnquiryFormResponse | undefined,
  vendorOptions: FieldOption[],
): QuotationFormValues {
  return {
    vendorId: vendorOptions.length === 1 ? (vendorOptions[0]?.value ?? '') : '',
    vendorQuoteRef: '',
    quoteDate: todayInIst(),
    validUntil: '',
    deliveryDays: '',
    paymentTermsDays: '',
    remarks: '',
    lines: (form?.lines ?? []).map((line) => ({
      enquiryLineId: line.enquiryLineId,
      isQuoted: true,
      rate: '',
      discountPercent: '',
      gstRate: line.defaultGstRate ?? '',
      makeBrand: '',
      remarks: '',
    })),
    charges: emptyCharges(),
  };
}

function editDefaults(quotation: QuotationDetailResponse): QuotationFormValues {
  return {
    vendorId: quotation.vendor.id,
    vendorQuoteRef: quotation.vendorQuoteRef ?? '',
    quoteDate: quotation.quoteDate,
    validUntil: quotation.validUntil ?? '',
    deliveryDays: quotation.deliveryDays === null ? '' : String(quotation.deliveryDays),
    paymentTermsDays: quotation.paymentTermsDays === null ? '' : String(quotation.paymentTermsDays),
    remarks: quotation.remarks ?? '',
    lines: quotation.lines.map((line) => ({
      enquiryLineId: line.enquiryLineId,
      isQuoted: line.isQuoted,
      rate: line.rate ?? '',
      discountPercent: line.discountPercent ?? '',
      gstRate: line.gstRate ?? '',
      makeBrand: line.makeBrand ?? '',
      remarks: line.remarks ?? '',
    })),
    charges: emptyCharges().map((empty) => {
      const saved = quotation.charges.find((charge) => charge.chargeType === empty.chargeType);

      return saved === undefined
        ? empty
        : {
            chargeType: saved.chargeType,
            description: saved.description ?? '',
            amount: saved.amount,
            gstRate: saved.gstRate,
          };
    }),
  };
}

export interface QuotationFormProps {
  /** Creating: everything the form needs for the chosen enquiry. */
  enquiryForm?: QuotationEnquiryFormResponse;
  /** Editing: a draft (only canEdit reaches the form). */
  quotation?: QuotationDetailResponse;
}

export function QuotationForm({ enquiryForm, quotation }: QuotationFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rows] = useState<QuotationRow[]>(() =>
    quotation !== undefined
      ? quotation.lines.map((line) => ({
          enquiryLineId: line.enquiryLineId,
          lineNo: line.lineNo,
          item: line.item,
          quantity: line.quantity,
        }))
      : (enquiryForm?.lines ?? []).map((line) => ({
          enquiryLineId: line.enquiryLineId,
          lineNo: line.lineNo,
          item: line.item,
          quantity: line.quantity,
        })),
  );
  const [vendorOptions] = useState<FieldOption[]>(() =>
    (enquiryForm?.vendors ?? [])
      .filter((vendor) => !vendor.hasQuotation)
      .map((vendor) => ({ value: vendor.id, label: vendor.label })),
  );
  const [defaults] = useState<QuotationFormValues>(() =>
    quotation !== undefined ? editDefaults(quotation) : createDefaults(enquiryForm, vendorOptions),
  );

  const enquiryLabel = quotation?.enquiry.number ?? enquiryForm?.enquiry.number ?? notSet;
  const fixedVendorLabel =
    quotation === undefined ? null : codeName(quotation.vendor.code, quotation.vendor.legalName);

  async function handleSubmit(values: QuotationFormValues): Promise<void> {
    setErrorMessage(null);

    if (!values.lines.some((line) => line.isQuoted)) {
      setErrorMessage(t.noQuotedLine);
      return;
    }

    // Blank optional fields become null in the contract schemas.
    const body = {
      vendorQuoteRef: values.vendorQuoteRef,
      quoteDate: values.quoteDate,
      validUntil: blankToNull(values.validUntil),
      deliveryDays: blankToNull(values.deliveryDays),
      paymentTermsDays: blankToNull(values.paymentTermsDays),
      remarks: values.remarks,
      lines: values.lines.map((line) => ({
        enquiryLineId: line.enquiryLineId,
        isQuoted: line.isQuoted,
        rate: blankToNull(line.rate),
        discountPercent: blankToNull(line.discountPercent),
        gstRate: blankToNull(line.gstRate),
        makeBrand: line.makeBrand,
        remarks: line.remarks,
      })),
      charges: values.charges
        .filter((charge) => charge.amount.length > 0)
        .map((charge) => ({
          chargeType: charge.chargeType,
          description: charge.chargeType === 'OTHER' ? charge.description : '',
          amount: charge.amount,
          gstRate: charge.gstRate,
        })),
    };

    if (quotation !== undefined) {
      const checked = UpdateQuotationRequest.safeParse(body);

      if (!checked.success) {
        setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
        return;
      }

      const result = await apiRequest('PATCH', `/api/quotations/${quotation.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(messageForApiError(result.code));
        return;
      }

      toast.success(t.updated);
      router.push(`/purchase/quotations/${quotation.id}`);
      return;
    }

    const checked = CreateQuotationRequest.safeParse({
      ...body,
      enquiryId: enquiryForm?.enquiry.id,
      vendorId: values.vendorId,
    });

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = await apiRequest<QuotationResponse>('POST', '/api/quotations', checked.data);

    if (!result.ok) {
      setErrorMessage(messageForApiError(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/purchase/quotations/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<QuotationFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(
            quotation !== undefined
              ? `/purchase/quotations/${quotation.id}`
              : '/purchase/quotations',
          )
        }
      >
        <FormSection title={t.sectionHeader}>
          <QuotationHeaderFields
            enquiryLabel={enquiryLabel}
            vendorOptions={vendorOptions}
            fixedVendorLabel={fixedVendorLabel}
          />
        </FormSection>
        <FormSection title={t.sectionLines} columns={1}>
          <QuotationLinesEditor rows={rows} />
        </FormSection>
        <FormSection title={t.sectionCharges} columns={1}>
          <QuotationChargesEditor />
        </FormSection>
        <FormSection title={t.sectionTotals} columns={1}>
          <QuotationTotalsPanel rows={rows} />
        </FormSection>
      </FormLayout>
    </div>
  );
}

function QuotationHeaderFields({
  enquiryLabel,
  vendorOptions,
  fixedVendorLabel,
}: {
  enquiryLabel: string;
  vendorOptions: FieldOption[];
  /** Set when editing: the vendor is fixed at creation. */
  fixedVendorLabel: string | null;
}) {
  return (
    <>
      <FieldShell id="field-enquiry-fixed" label={t.fieldEnquiry}>
        <Input id="field-enquiry-fixed" value={enquiryLabel} readOnly disabled />
      </FieldShell>
      {fixedVendorLabel === null ? (
        <SelectField<QuotationFormValues>
          name="vendorId"
          label={t.fieldVendor}
          options={vendorOptions}
          placeholder={t.selectPlaceholder}
          required
        />
      ) : (
        <FieldShell
          id="field-vendor-fixed"
          label={t.fieldVendor}
          description={t.fieldVendorFixedHint}
        >
          <Input id="field-vendor-fixed" value={fixedVendorLabel} readOnly disabled />
        </FieldShell>
      )}
      <TextField<QuotationFormValues> name="vendorQuoteRef" label={t.fieldVendorQuoteRef} />
      <DateField<QuotationFormValues> name="quoteDate" label={t.fieldQuoteDate} required />
      <DateField<QuotationFormValues> name="validUntil" label={t.fieldValidUntil} />
      <TextField<QuotationFormValues>
        name="deliveryDays"
        label={t.fieldDeliveryDays}
        description={t.fieldDaysHint}
      />
      <TextField<QuotationFormValues>
        name="paymentTermsDays"
        label={t.fieldPaymentTermsDays}
        description={t.fieldDaysHint}
      />
      <TextareaField<QuotationFormValues>
        name="remarks"
        label={t.fieldRemarks}
        className="sm:col-span-2"
        rows={2}
      />
    </>
  );
}

function QuotationLinesEditor({ rows }: { rows: QuotationRow[] }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();
  const lines = useWatch({ control, name: 'lines' });
  const totals = quotationTotals(totalsLines(rows, lines), []);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t.linesHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-6xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
              <th className="min-w-[16rem] px-2 py-2 font-medium">{t.columnItem}</th>
              <th className="w-16 px-2 py-2 font-medium">{t.columnUnit}</th>
              <th className="w-24 px-2 py-2 text-right font-medium">{t.columnQuantity}</th>
              <th className="w-16 px-2 py-2 font-medium">{t.columnQuoted}</th>
              <th className="w-32 px-2 py-2 font-medium">{t.columnRate}</th>
              <th className="w-24 px-2 py-2 font-medium">{t.columnDiscount}</th>
              <th className="w-24 px-2 py-2 font-medium">{t.columnGst}</th>
              <th className="w-36 px-2 py-2 font-medium">{t.columnMakeBrand}</th>
              <th className="w-40 px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              <th className="w-32 px-2 py-2 text-right font-medium">{t.columnLineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowErrors = errors.lines?.[index];
              const quoted = lines[index]?.isQuoted ?? false;
              const lineTotal = totals.lineTotals[index] ?? null;

              return (
                <tr
                  key={row.enquiryLineId}
                  className={cn('border-b border-border align-top', quoted ? '' : 'opacity-60')}
                >
                  <td className="px-2 py-3">{row.lineNo}</td>
                  <td className="px-2 py-3">{itemText(row.item)}</td>
                  <td className="px-2 py-3">{row.item.unitCode}</td>
                  <td className="px-2 py-3 text-right">
                    {formatQty(row.quantity, row.item.decimalPlaces)}
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={t.columnQuoted}
                      {...register(`lines.${index}.isQuoted`)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnRate}
                      aria-invalid={rowErrors?.rate !== undefined}
                      {...register(`lines.${index}.rate`)}
                    />
                    {rowErrors?.rate?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.rate.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnDiscount}
                      aria-invalid={rowErrors?.discountPercent !== undefined}
                      {...register(`lines.${index}.discountPercent`)}
                    />
                    {rowErrors?.discountPercent?.message ? (
                      <p className="mt-1 text-xs text-danger">
                        {rowErrors.discountPercent.message}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnGst}
                      aria-invalid={rowErrors?.gstRate !== undefined}
                      {...register(`lines.${index}.gstRate`)}
                    />
                    {rowErrors?.gstRate?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.gstRate.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label={t.columnMakeBrand}
                      {...register(`lines.${index}.makeBrand`)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label={t.columnLineRemarks}
                      {...register(`lines.${index}.remarks`)}
                    />
                  </td>
                  <td className="px-2 py-3 text-right">
                    {lineTotal === null ? notSet : formatINR(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotationChargesEditor() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();
  const charges = useWatch({ control, name: 'charges' });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t.chargesHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-2xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-48 px-2 py-2 font-medium">{t.columnCharge}</th>
              <th className="px-2 py-2 font-medium">{t.columnChargeDescription}</th>
              <th className="w-40 px-2 py-2 font-medium">{t.columnAmount}</th>
              <th className="w-28 px-2 py-2 font-medium">{t.columnGst}</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((charge, index) => {
              const rowErrors = errors.charges?.[index];

              return (
                <tr key={charge.chargeType} className="border-b border-border align-top">
                  <td className="px-2 py-3">{t.chargeTypes[charge.chargeType]}</td>
                  <td className="px-2 py-2">
                    {charge.chargeType === 'OTHER' ? (
                      <>
                        <Input
                          aria-label={t.columnChargeDescription}
                          aria-invalid={rowErrors?.description !== undefined}
                          {...register(`charges.${index}.description`)}
                        />
                        {rowErrors?.description?.message ? (
                          <p className="mt-1 text-xs text-danger">
                            {rowErrors.description.message}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{notSet}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnAmount}
                      aria-invalid={rowErrors?.amount !== undefined}
                      {...register(`charges.${index}.amount`)}
                    />
                    {rowErrors?.amount?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.amount.message}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t.columnGst}
                      aria-invalid={rowErrors?.gstRate !== undefined}
                      {...register(`charges.${index}.gstRate`)}
                    />
                    {rowErrors?.gstRate?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.gstRate.message}</p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotationTotalsPanel({ rows }: { rows: QuotationRow[] }) {
  const { control } = useFormContext<QuotationFormValues>();
  const lines = useWatch({ control, name: 'lines' });
  const charges = useWatch({ control, name: 'charges' });
  const totals = quotationTotals(totalsLines(rows, lines), charges);

  return (
    <div className="flex flex-col gap-2">
      <KeyValueGrid
        columns={2}
        items={[
          { label: t.totalSubtotal, value: formatINR(totals.subtotal) },
          { label: t.totalTax, value: formatINR(totals.taxTotal) },
          { label: t.totalCharges, value: formatINR(totals.chargesTotal) },
          { label: t.totalGrand, value: formatINR(totals.grandTotal) },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t.totalsHint}</p>
    </div>
  );
}
