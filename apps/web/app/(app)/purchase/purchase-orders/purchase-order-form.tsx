'use client';

import {
  CreatePurchaseOrderRequest,
  MAX_PURCHASE_ORDER_LINES,
  MAX_PURCHASE_ORDER_TERMS,
  PURCHASE_ORDER_CHARGE_TYPES,
  PURCHASE_ORDER_DEFAULT_TERMS,
  PurchaseOrderItemOptionsResponse,
  PurchaseOrderVendorDetails,
  PurchaseOrderVendorOptionsResponse,
  QUANTITY_PATTERN,
  QUOTATION_AMOUNT_PATTERN,
  QUOTATION_PERCENT_PATTERN,
  QUOTATION_RATE_PATTERN,
  UpdatePurchaseOrderRequest,
  type EnquiryItemSummary,
  type PurchaseOrderComparisonFormResponse,
  type PurchaseOrderDetailResponse,
  type PurchaseOrderFormOptionsResponse,
  type PurchaseOrderLineReference,
  type PurchaseOrderResponse,
  type PurchaseOrderTaxType,
} from '@uie/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { apiRead, apiRequest } from '@/lib/api/client';
import { formatDate, formatINR } from '@/lib/format';
import { buildQueryString } from '@/lib/list-params';
import { purchaseOrderTotals } from '@/lib/purchase-order-totals';
import * as toast from '@/lib/toast';
import { codeName, itemText } from '../enquiries/_components/enquiry-text';
import { RemotePicker } from '../enquiries/_components/remote-picker';
import { purchaseOrderErrorMessage } from './_components/purchase-order-errors';
import {
  contactLabel,
  differenceHint,
  gstOptionLabel,
  lineError,
} from './_components/purchase-order-text';

const t = terminology.purchaseOrders;
const v = terminology.validation;
const notSet = terminology.labels.notSet;

/** Select value for "no store" / "no contact" (Radix Select cannot use ''). */
const NONE = 'none';

const EMPTY_LINE = {
  itemId: '',
  comparisonLineId: '',
  quantity: '',
  rate: '',
  discountPercent: '',
  gstRate: '',
  remarks: '',
};

const PAYMENT_TITLE = PURCHASE_ORDER_DEFAULT_TERMS[1]?.title ?? null;
const DELIVERY_TITLE = PURCHASE_ORDER_DEFAULT_TERMS[2]?.title ?? null;

type VendorOption = PurchaseOrderVendorOptionsResponse['vendors'][number];
type ItemOption = PurchaseOrderItemOptionsResponse['items'][number];

/** Today in IST (UTC+05:30), the same rule the API applies (OQ-85 a). */
function todayInIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length === 0 || trimmed === NONE ? null : trimmed;
}

/** Significant decimal places of a quantity string ("2.500" -> 1). */
function decimalsOf(value: string): number {
  return (value.split('.')[1] ?? '').replace(/0+$/, '').length;
}

const optionalPercent = (message: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value.length === 0 || (QUOTATION_PERCENT_PATTERN.test(value) && Number(value) <= 100),
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
    projectId: z.string().min(1, v.selectProject),
    siteId: z.string().min(1, v.selectSite),
    storeId: z.string(),
    vendorId: z.string().min(1, v.selectQuoteVendor),
    vendorGstRegistrationId: z.string(),
    vendorContactId: z.string(),
    poDate: z.string().min(1, v.required),
    subject: z.string().trim().min(1, v.required).max(200),
    vendorQuoteRef: z.string().max(60),
    vendorQuoteDate: z.string(),
    deliveryDate: z.string(),
    paymentTermsDays: optionalDays,
    remarks: z.string().max(500),
    lines: z
      .array(
        z.object({
          itemId: z.string().min(1, t.selectItemRequired),
          comparisonLineId: z.string(),
          quantity: z
            .string()
            .trim()
            .regex(QUANTITY_PATTERN, v.invalidQuantity)
            .refine((value) => Number(value) > 0, v.invalidQuantity),
          rate: z.string().trim().regex(QUOTATION_RATE_PATTERN, v.invalidRate),
          discountPercent: optionalPercent(v.invalidPercent),
          gstRate: z
            .string()
            .trim()
            .regex(QUOTATION_PERCENT_PATTERN, v.invalidGstRate)
            .refine((value) => Number(value) <= 100, v.invalidGstRate),
          remarks: z.string().max(300),
        }),
      )
      .min(1)
      .max(MAX_PURCHASE_ORDER_LINES),
    charges: z.array(
      z.object({
        chargeType: z.enum(PURCHASE_ORDER_CHARGE_TYPES),
        description: z.string().max(120),
        amount: z
          .string()
          .trim()
          .refine(
            (value) => value.length === 0 || QUOTATION_AMOUNT_PATTERN.test(value),
            v.invalidAmount,
          ),
        gstRate: optionalPercent(v.invalidGstRate),
      }),
    ),
    terms: z
      .array(z.object({ title: z.string().max(60), text: z.string().max(1000) }))
      .max(MAX_PURCHASE_ORDER_TERMS),
  })
  .superRefine((values, ctx) => {
    const seenItems = new Set<string>();

    values.lines.forEach((line, index) => {
      if (line.comparisonLineId.length > 0 || line.itemId.length === 0) {
        return;
      }

      if (seenItems.has(line.itemId)) {
        ctx.addIssue({ code: 'custom', path: ['lines', index, 'itemId'], message: t.itemRepeated });
      }

      seenItems.add(line.itemId);
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

    if (values.poDate > todayInIst()) {
      ctx.addIssue({ code: 'custom', path: ['poDate'], message: t.futurePoDate });
    }

    if (values.deliveryDate.length > 0 && values.deliveryDate < values.poDate) {
      ctx.addIssue({ code: 'custom', path: ['deliveryDate'], message: t.deliveryBeforePo });
    }

    if (values.vendorQuoteDate.length > 0 && values.vendorQuoteDate > values.poDate) {
      ctx.addIssue({ code: 'custom', path: ['vendorQuoteDate'], message: t.quoteAfterPo });
    }
  });

type Values = z.infer<typeof schema>;
type LineValues = Values['lines'][number];

export type PurchaseOrderFormMode =
  | { kind: 'direct' }
  | { kind: 'comparison'; prefill: PurchaseOrderComparisonFormResponse }
  | {
      kind: 'edit';
      purchaseOrder: PurchaseOrderDetailResponse;
      vendor: PurchaseOrderVendorDetails;
    };

interface LineMeta {
  item: EnquiryItemSummary;
  reference: PurchaseOrderLineReference | null;
}

type LineMetaMap = Record<string, LineMeta>;

/** A comparison line that may be on the PO (OQ-84), with the values it starts from. */
interface ComparisonRow {
  comparisonLineId: string;
  item: EnquiryItemSummary;
  reference: PurchaseOrderLineReference | null;
  quantity: string;
  rate: string;
  discountPercent: string;
  gstRate: string;
}

interface FixedScope {
  comparison: string | null;
  project: string;
  site: string;
  vendor: string;
  hint: string;
}

function lineKey(line: { itemId: string; comparisonLineId: string }): string {
  return line.comparisonLineId.length > 0 ? line.comparisonLineId : line.itemId;
}

function lineFromRow(row: ComparisonRow): LineValues {
  return {
    itemId: row.item.id,
    comparisonLineId: row.comparisonLineId,
    quantity: row.quantity,
    rate: row.rate,
    discountPercent: row.discountPercent,
    gstRate: row.gstRate,
    remarks: '',
  };
}

function emptyCharges(): Values['charges'] {
  return PURCHASE_ORDER_CHARGE_TYPES.map((chargeType) => ({
    chargeType,
    description: '',
    amount: '',
    gstRate: '',
  }));
}

function defaultTerms(): Values['terms'] {
  return PURCHASE_ORDER_DEFAULT_TERMS.map((term) => ({
    title: term.title ?? '',
    text: term.text ?? '',
  }));
}

function daysValue(days: number | null): string {
  return days === null ? '' : String(days);
}

function primaryContactId(details: PurchaseOrderVendorDetails): string {
  return details.contacts.find((contact) => contact.isPrimary)?.id ?? NONE;
}

function comparisonRowsOf(mode: PurchaseOrderFormMode): ComparisonRow[] {
  if (mode.kind === 'comparison') {
    return mode.prefill.lines.map((line) => ({
      comparisonLineId: line.comparisonLineId,
      item: line.item,
      reference: line.reference,
      quantity: line.reference.enquiryQuantity,
      rate: line.reference.quotedRate,
      discountPercent: line.reference.quotedDiscountPercent,
      gstRate: line.reference.quotedGstRate,
    }));
  }

  if (mode.kind === 'edit') {
    return mode.purchaseOrder.lines
      .filter((line) => line.comparisonLineId !== null)
      .map((line) => ({
        comparisonLineId: line.comparisonLineId ?? '',
        item: line.item,
        reference: line.reference,
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: line.discountPercent,
        gstRate: line.gstRate,
      }));
  }

  return [];
}

function initialMeta(mode: PurchaseOrderFormMode, rows: readonly ComparisonRow[]): LineMetaMap {
  const meta: LineMetaMap = {};

  for (const row of rows) {
    meta[row.comparisonLineId] = { item: row.item, reference: row.reference };
  }

  if (mode.kind === 'edit') {
    for (const line of mode.purchaseOrder.lines) {
      if (line.comparisonLineId === null) {
        meta[line.item.id] = { item: line.item, reference: null };
      }
    }
  }

  return meta;
}

function defaultsOf(
  mode: PurchaseOrderFormMode,
  rows: readonly ComparisonRow[],
  options: PurchaseOrderFormOptionsResponse,
): Values {
  if (mode.kind === 'edit') {
    const po = mode.purchaseOrder;
    const vendor = mode.vendor;

    return {
      projectId: po.project.id,
      siteId: po.site.id,
      storeId: po.store?.id ?? NONE,
      vendorId: po.vendor.id,
      // The response carries GSTIN and contact name, not ids (OQ-86 b).
      vendorGstRegistrationId:
        vendor.gstRegistrations.find((row) => row.gstin === po.vendorGstin)?.id ?? '',
      vendorContactId:
        vendor.contacts.find((contact) => contact.name === po.vendorContactName)?.id ?? NONE,
      poDate: po.poDate,
      subject: po.subject,
      vendorQuoteRef: po.vendorQuoteRef ?? '',
      vendorQuoteDate: po.vendorQuoteDate ?? '',
      deliveryDate: po.deliveryDate ?? '',
      paymentTermsDays: daysValue(po.paymentTermsDays),
      remarks: po.remarks ?? '',
      lines: po.lines.map((line) => ({
        itemId: line.item.id,
        comparisonLineId: line.comparisonLineId ?? '',
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: line.discountPercent,
        gstRate: line.gstRate,
        remarks: line.remarks ?? '',
      })),
      charges: emptyCharges().map((empty) => {
        const saved = po.charges.find((charge) => charge.chargeType === empty.chargeType);

        return saved === undefined
          ? empty
          : {
              chargeType: saved.chargeType,
              description: saved.description ?? '',
              amount: saved.amount,
              gstRate: saved.gstRate,
            };
      }),
      terms: po.terms.map((term) => ({ title: term.title ?? '', text: term.text ?? '' })),
    };
  }

  const base = {
    storeId: NONE,
    poDate: todayInIst(),
    subject: '',
    deliveryDate: '',
    remarks: '',
    charges: emptyCharges(),
    terms: defaultTerms(),
  };

  if (mode.kind === 'comparison') {
    const prefill = mode.prefill;
    const vendor = prefill.vendor;

    return {
      ...base,
      projectId: prefill.project.id,
      siteId: prefill.site.id,
      vendorId: vendor.vendor.id,
      vendorGstRegistrationId:
        vendor.gstRegistrations.length === 1 ? (vendor.gstRegistrations[0]?.id ?? '') : '',
      vendorContactId: primaryContactId(vendor),
      vendorQuoteRef: prefill.vendorQuoteRef ?? '',
      vendorQuoteDate: prefill.vendorQuoteDate ?? '',
      paymentTermsDays: daysValue(vendor.paymentTermsDays),
      lines: rows.map(lineFromRow),
    };
  }

  return {
    ...base,
    projectId: options.projects.length === 1 ? (options.projects[0]?.id ?? '') : '',
    siteId: '',
    vendorId: '',
    vendorGstRegistrationId: '',
    vendorContactId: NONE,
    vendorQuoteRef: '',
    vendorQuoteDate: '',
    paymentTermsDays: '',
    lines: [EMPTY_LINE],
  };
}

function fixedOf(mode: PurchaseOrderFormMode): FixedScope | null {
  if (mode.kind === 'comparison') {
    const prefill = mode.prefill;

    return {
      comparison: prefill.comparison.number,
      project: codeName(prefill.project.code, prefill.project.name),
      site: codeName(prefill.site.code, prefill.site.name),
      vendor: codeName(prefill.vendor.vendor.code, prefill.vendor.vendor.legalName),
      hint: t.fieldFromComparisonHint,
    };
  }

  if (mode.kind === 'edit') {
    const po = mode.purchaseOrder;

    return {
      comparison: po.comparison?.number ?? null,
      project: codeName(po.project.code, po.project.name),
      site: codeName(po.site.code, po.site.name),
      vendor: codeName(po.vendor.code, po.vendor.legalName),
      hint: t.fieldFixedHint,
    };
  }

  return null;
}

/** A draft's own store stays selectable even if no longer in the option list. */
function withExisting(
  options: PurchaseOrderFormOptionsResponse,
  mode: PurchaseOrderFormMode,
): PurchaseOrderFormOptionsResponse {
  if (mode.kind !== 'edit' || mode.purchaseOrder.store === null) {
    return options;
  }

  const store = mode.purchaseOrder.store;

  if (options.stores.some((option) => option.id === store.id)) {
    return options;
  }

  return {
    ...options,
    stores: [
      {
        id: store.id,
        label: codeName(store.code, store.name),
        siteId: mode.purchaseOrder.site.id,
      },
      ...options.stores,
    ],
  };
}

/** Billing vs vendor GST state (OQ-71); null while it cannot be known yet. */
function taxTypeOf(
  details: PurchaseOrderVendorDetails | null,
  registrationId: string,
): PurchaseOrderTaxType | null {
  if (details === null || details.billingGstin === null) {
    return null;
  }

  if (details.gstRegistrations.length === 0) {
    return 'NONE';
  }

  return details.gstRegistrations.find((row) => row.id === registrationId)?.taxType ?? null;
}

/** Blank Payment Terms / Delivery texts are filled from the header fields (OQ-79). */
function termsForSave(values: Values): { title: string; text: string }[] {
  return values.terms
    .map((term) => {
      const title = term.title.trim();
      let text = term.text.trim();

      if (text.length === 0 && title === PAYMENT_TITLE && values.paymentTermsDays.trim()) {
        text = `${values.paymentTermsDays.trim()} ${t.daysSuffix}`;
      }

      if (text.length === 0 && title === DELIVERY_TITLE && values.deliveryDate.length > 0) {
        text = formatDate(values.deliveryDate);
      }

      return { title, text };
    })
    .filter((term) => term.title.length > 0 || term.text.length > 0);
}

async function loadVendors(search: string): Promise<VendorOption[] | null> {
  const query = buildQueryString({ search });
  const result = await apiRead(
    `/api/purchase-orders/vendor-options${query.length > 0 ? `?${query}` : ''}`,
    PurchaseOrderVendorOptionsResponse,
  );

  return result.ok ? result.data.vendors : null;
}

async function loadItems(search: string): Promise<ItemOption[] | null> {
  const query = buildQueryString({ search });
  const result = await apiRead(
    `/api/purchase-orders/item-options${query.length > 0 ? `?${query}` : ''}`,
    PurchaseOrderItemOptionsResponse,
  );

  return result.ok ? result.data.items : null;
}

async function loadVendorDetails(
  vendorId: string,
  siteId: string,
): Promise<PurchaseOrderVendorDetails | null> {
  const result = await apiRead(
    `/api/purchase-orders/vendor-details?${buildQueryString({ vendorId, siteId })}`,
    PurchaseOrderVendorDetails,
  );

  return result.ok ? result.data : null;
}

export interface PurchaseOrderFormProps {
  mode: PurchaseOrderFormMode;
  formOptions: PurchaseOrderFormOptionsResponse;
}

export function PurchaseOrderForm({ mode, formOptions }: PurchaseOrderFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [options] = useState(() => withExisting(formOptions, mode));
  const [comparisonRows] = useState<ComparisonRow[]>(() => comparisonRowsOf(mode));
  const [lineMeta, setLineMeta] = useState<LineMetaMap>(() => initialMeta(mode, comparisonRows));
  const [defaults] = useState<Values>(() => defaultsOf(mode, comparisonRows, options));
  const [fixed] = useState<FixedScope | null>(() => fixedOf(mode));
  const [vendorDetails, setVendorDetails] = useState<PurchaseOrderVendorDetails | null>(() =>
    mode.kind === 'comparison' ? mode.prefill.vendor : mode.kind === 'edit' ? mode.vendor : null,
  );
  const [vendorFailed, setVendorFailed] = useState(false);
  const [vendorLabel, setVendorLabel] = useState<string | null>(null);

  const isComparison =
    mode.kind === 'comparison' ||
    (mode.kind === 'edit' && mode.purchaseOrder.source === 'COMPARISON');

  async function handleSubmit(values: Values): Promise<void> {
    setErrorMessage(null);

    if (vendorDetails === null) {
      setErrorMessage(t.vendorUnavailable);
      return;
    }

    if (
      vendorDetails.gstRegistrations.length > 0 &&
      !vendorDetails.gstRegistrations.some((row) => row.id === values.vendorGstRegistrationId)
    ) {
      setErrorMessage(t.vendorGstRequired);
      return;
    }

    if (mode.kind === 'comparison' && values.poDate < mode.prefill.comparison.comparisonDate) {
      setErrorMessage(t.poBeforeComparison);
      return;
    }

    for (const [index, line] of values.lines.entries()) {
      const meta = lineMeta[lineKey(line)];

      if (meta !== undefined && decimalsOf(line.quantity) > meta.item.decimalPlaces) {
        setErrorMessage(lineError(index, `${t.tooManyDecimals} ${meta.item.decimalPlaces}`));
        return;
      }
    }

    // Blank optional fields become null in the contract schemas.
    const body = {
      storeId: blankToNull(values.storeId),
      vendorGstRegistrationId: blankToNull(values.vendorGstRegistrationId),
      vendorContactId: blankToNull(values.vendorContactId),
      poDate: values.poDate,
      subject: values.subject,
      vendorQuoteRef: values.vendorQuoteRef,
      vendorQuoteDate: blankToNull(values.vendorQuoteDate),
      deliveryDate: blankToNull(values.deliveryDate),
      paymentTermsDays: blankToNull(values.paymentTermsDays),
      remarks: values.remarks,
      lines: values.lines.map((line) => ({
        itemId: line.itemId,
        comparisonLineId: blankToNull(line.comparisonLineId),
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: blankToNull(line.discountPercent),
        gstRate: line.gstRate,
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
      terms: termsForSave(values),
    };

    if (mode.kind === 'edit') {
      const checked = UpdatePurchaseOrderRequest.safeParse(body);

      if (!checked.success) {
        setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
        return;
      }

      const id = mode.purchaseOrder.id;
      const result = await apiRequest('PATCH', `/api/purchase-orders/${id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(purchaseOrderErrorMessage(result.code));
        return;
      }

      toast.success(t.updated);
      router.push(`/purchase/purchase-orders/${id}`);
      return;
    }

    const checked = CreatePurchaseOrderRequest.safeParse(
      mode.kind === 'comparison'
        ? {
            ...body,
            source: 'COMPARISON',
            comparisonId: mode.prefill.comparison.id,
            vendorId: values.vendorId,
          }
        : {
            ...body,
            source: 'DIRECT',
            projectId: values.projectId,
            siteId: values.siteId,
            vendorId: values.vendorId,
          },
    );

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = await apiRequest<PurchaseOrderResponse>(
      'POST',
      '/api/purchase-orders',
      checked.data,
    );

    if (!result.ok) {
      setErrorMessage(purchaseOrderErrorMessage(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/purchase/purchase-orders/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      {vendorDetails !== null && vendorDetails.billingGstin === null ? (
        <p role="status" className="text-sm text-danger">
          {t.billingMissing}
        </p>
      ) : null}
      {vendorFailed ? (
        <p role="status" className="text-sm text-danger">
          {t.vendorUnavailable}
        </p>
      ) : null}
      <FormLayout<Values>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(
            mode.kind === 'edit'
              ? `/purchase/purchase-orders/${mode.purchaseOrder.id}`
              : '/purchase/purchase-orders',
          )
        }
      >
        {mode.kind === 'direct' ? (
          <DirectVendorWatcher
            onLoaded={(details, failed) => {
              setVendorDetails(details);
              setVendorFailed(failed);
            }}
          />
        ) : null}
        <FormSection title={t.sectionHeader}>
          <HeaderFields
            options={options}
            fixed={fixed}
            vendorDetails={vendorDetails}
            vendorLabel={vendorLabel}
            onVendorChosen={(option) => setVendorLabel(option.label)}
          />
        </FormSection>
        <FormSection title={t.sectionLines} columns={1}>
          <LinesEditor
            isComparison={isComparison}
            lineMeta={lineMeta}
            comparisonRows={comparisonRows}
            vendorDetails={vendorDetails}
            onItemChosen={(option) =>
              setLineMeta((previous) => ({
                ...previous,
                [option.item.id]: { item: option.item, reference: null },
              }))
            }
          />
        </FormSection>
        <FormSection title={t.sectionCharges} columns={1}>
          <ChargesEditor />
        </FormSection>
        <FormSection title={t.sectionTerms} columns={1}>
          <TermsEditor />
        </FormSection>
        <FormSection title={t.sectionTotals} columns={1}>
          <TotalsPanel vendorDetails={vendorDetails} />
        </FormSection>
      </FormLayout>
    </div>
  );
}

/** Direct PO: loads GST registrations and contacts when the vendor or site changes. */
function DirectVendorWatcher({
  onLoaded,
}: {
  onLoaded: (details: PurchaseOrderVendorDetails | null, failed: boolean) => void;
}) {
  const { control, getValues, setValue } = useFormContext<Values>();
  const vendorId = useWatch({ control, name: 'vendorId' });
  const siteId = useWatch({ control, name: 'siteId' });
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    onLoadedRef.current(null, false);

    if (vendorId.length === 0 || siteId.length === 0) {
      return;
    }

    let active = true;

    void loadVendorDetails(vendorId, siteId).then((details) => {
      if (!active) {
        return;
      }

      onLoadedRef.current(details, details === null);

      const registrations = details?.gstRegistrations ?? [];

      if (!registrations.some((row) => row.id === getValues('vendorGstRegistrationId'))) {
        setValue(
          'vendorGstRegistrationId',
          registrations.length === 1 ? (registrations[0]?.id ?? '') : '',
        );
      }

      const contacts = details?.contacts ?? [];

      if (!contacts.some((contact) => contact.id === getValues('vendorContactId'))) {
        setValue('vendorContactId', details === null ? NONE : primaryContactId(details));
      }

      if (
        getValues('paymentTermsDays').trim().length === 0 &&
        details !== null &&
        details.paymentTermsDays !== null
      ) {
        setValue('paymentTermsDays', String(details.paymentTermsDays));
      }
    });

    return () => {
      active = false;
    };
  }, [vendorId, siteId, getValues, setValue]);

  return null;
}

function HeaderFields({
  options,
  fixed,
  vendorDetails,
  vendorLabel,
  onVendorChosen,
}: {
  options: PurchaseOrderFormOptionsResponse;
  /** Set for a comparison PO and when editing: project, site and vendor cannot change. */
  fixed: FixedScope | null;
  vendorDetails: PurchaseOrderVendorDetails | null;
  vendorLabel: string | null;
  onVendorChosen: (option: VendorOption) => void;
}) {
  const { control, getValues, setValue } = useFormContext<Values>();
  const projectId = useWatch({ control, name: 'projectId' });
  const siteId = useWatch({ control, name: 'siteId' });
  const isFixed = fixed !== null;

  // Direct PO: the site must belong to the project; picks the only site automatically.
  useEffect(() => {
    if (isFixed) {
      return;
    }

    const sites = options.sites.filter((site) => site.projectId === projectId);

    if (!sites.some((site) => site.id === getValues('siteId'))) {
      setValue('siteId', sites.length === 1 ? (sites[0]?.id ?? '') : '');
    }
  }, [isFixed, projectId, options, getValues, setValue]);

  // The store must belong to the site.
  useEffect(() => {
    const current = getValues('storeId');

    if (
      current !== NONE &&
      !options.stores.some((store) => store.id === current && store.siteId === siteId)
    ) {
      setValue('storeId', NONE);
    }
  }, [siteId, options, getValues, setValue]);

  const projectOptions: FieldOption[] = options.projects.map((project) => ({
    value: project.id,
    label: project.label,
  }));
  const siteOptions: FieldOption[] = options.sites
    .filter((site) => site.projectId === projectId)
    .map((site) => ({ value: site.id, label: site.label }));
  const storeOptions: FieldOption[] = [
    { value: NONE, label: t.noStore },
    ...options.stores
      .filter((store) => store.siteId === siteId)
      .map((store) => ({ value: store.id, label: store.label })),
  ];
  const gstOptions: FieldOption[] = (vendorDetails?.gstRegistrations ?? []).map((row) => ({
    value: row.id,
    label: gstOptionLabel(row),
  }));
  const contactOptions: FieldOption[] = [
    { value: NONE, label: t.noContact },
    ...(vendorDetails?.contacts ?? []).map((contact) => ({
      value: contact.id,
      label: contactLabel(contact),
    })),
  ];

  return (
    <>
      {fixed === null ? (
        <>
          <SelectField<Values>
            name="projectId"
            label={t.fieldProject}
            options={projectOptions}
            placeholder={t.selectPlaceholder}
            required
          />
          <SelectField<Values>
            name="siteId"
            label={t.fieldSite}
            options={siteOptions}
            placeholder={t.selectPlaceholder}
            required
          />
          <Controller
            control={control}
            name="vendorId"
            render={({ field, fieldState }) => (
              <FieldShell id="field-vendor" label={t.fieldVendor}>
                <div className="flex flex-col gap-1">
                  <RemotePicker<VendorOption>
                    id="field-vendor"
                    placeholder={t.selectVendor}
                    selectedLabel={vendorLabel}
                    unavailableText={t.vendorsUnavailable}
                    load={loadVendors}
                    optionKey={(option) => option.id}
                    optionLabel={(option) => option.label}
                    isSelected={(option) => option.id === field.value}
                    invalid={fieldState.error !== undefined}
                    onSelect={(option) => {
                      onVendorChosen(option);
                      field.onChange(option.id);
                      field.onBlur();
                    }}
                  />
                  {fieldState.error?.message ? (
                    <p className="text-xs text-danger">{fieldState.error.message}</p>
                  ) : null}
                </div>
              </FieldShell>
            )}
          />
        </>
      ) : (
        <>
          {fixed.comparison === null ? null : (
            <FieldShell
              id="field-comparison-fixed"
              label={t.fieldComparison}
              description={fixed.hint}
            >
              <Input id="field-comparison-fixed" value={fixed.comparison} readOnly disabled />
            </FieldShell>
          )}
          <FieldShell id="field-project-fixed" label={t.fieldProject} description={fixed.hint}>
            <Input id="field-project-fixed" value={fixed.project} readOnly disabled />
          </FieldShell>
          <FieldShell id="field-site-fixed" label={t.fieldSite} description={fixed.hint}>
            <Input id="field-site-fixed" value={fixed.site} readOnly disabled />
          </FieldShell>
          <FieldShell id="field-vendor-fixed" label={t.fieldVendor} description={fixed.hint}>
            <Input id="field-vendor-fixed" value={fixed.vendor} readOnly disabled />
          </FieldShell>
        </>
      )}
      <SelectField<Values> name="storeId" label={t.fieldStore} options={storeOptions} />
      {vendorDetails === null ? null : gstOptions.length === 0 ? (
        <FieldShell id="field-vendor-gst-none" label={t.fieldVendorGst}>
          <Input id="field-vendor-gst-none" value={t.unregistered} readOnly disabled />
        </FieldShell>
      ) : (
        <SelectField<Values>
          name="vendorGstRegistrationId"
          label={t.fieldVendorGst}
          options={gstOptions}
          placeholder={t.selectPlaceholder}
          description={t.fieldVendorGstHint}
          required
        />
      )}
      {vendorDetails === null ? null : (
        <SelectField<Values>
          name="vendorContactId"
          label={t.fieldVendorContact}
          options={contactOptions}
        />
      )}
      <DateField<Values> name="poDate" label={t.fieldPoDate} required />
      <TextField<Values> name="subject" label={t.fieldSubject} description={t.fieldSubjectHint} />
      <TextField<Values> name="vendorQuoteRef" label={t.fieldVendorQuoteRef} />
      <DateField<Values> name="vendorQuoteDate" label={t.fieldVendorQuoteDate} />
      <DateField<Values> name="deliveryDate" label={t.fieldDeliveryDate} />
      <TextField<Values>
        name="paymentTermsDays"
        label={t.fieldPaymentTermsDays}
        description={t.fieldDaysHint}
      />
      <TextareaField<Values>
        name="remarks"
        label={t.fieldRemarks}
        className="sm:col-span-2"
        rows={2}
      />
    </>
  );
}

function usePreview(vendorDetails: PurchaseOrderVendorDetails | null) {
  const { control } = useFormContext<Values>();
  const lines = useWatch({ control, name: 'lines' });
  const charges = useWatch({ control, name: 'charges' });
  const registrationId = useWatch({ control, name: 'vendorGstRegistrationId' });
  const taxType = taxTypeOf(vendorDetails, registrationId);

  return { taxType, totals: purchaseOrderTotals(lines, charges, taxType ?? 'NONE') };
}

function LinesEditor({
  isComparison,
  lineMeta,
  comparisonRows,
  vendorDetails,
  onItemChosen,
}: {
  isComparison: boolean;
  lineMeta: LineMetaMap;
  comparisonRows: ComparisonRow[];
  vendorDetails: PurchaseOrderVendorDetails | null;
  onItemChosen: (option: ItemOption) => void;
}) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });
  const { totals } = usePreview(vendorDetails);
  const removedRows = comparisonRows.filter(
    (row) => !lines.some((line) => line.comparisonLineId === row.comparisonLineId),
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {isComparison ? t.linesHintComparison : t.linesHintDirect}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-6xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
              <th className="min-w-[20rem] px-2 py-2 font-medium">{t.columnItem}</th>
              <th className="w-16 px-2 py-2 font-medium">{t.columnUnit}</th>
              <th className="w-28 px-2 py-2 font-medium">{t.columnQuantity}</th>
              <th className="w-32 px-2 py-2 font-medium">{t.columnRate}</th>
              <th className="w-24 px-2 py-2 font-medium">{t.columnDiscount}</th>
              <th className="w-24 px-2 py-2 font-medium">{t.columnGst}</th>
              <th className="w-40 px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              <th className="w-32 px-2 py-2 text-right font-medium">{t.columnLineTotal}</th>
              <th className="w-12 px-2 py-2" aria-label={t.removeLine} />
            </tr>
          </thead>
          <tbody>
            {fields.map((row, index) => {
              const line = lines[index];
              const meta = line === undefined ? undefined : lineMeta[lineKey(line)];
              const rowErrors = errors.lines?.[index];
              const hint =
                meta === undefined || line === undefined
                  ? null
                  : differenceHint(meta.reference, line, meta.item.decimalPlaces);
              const lineTotal = totals.lineTotals[index] ?? null;

              return (
                <tr key={row.id} className="border-b border-border align-top">
                  <td className="px-2 py-3">{index + 1}</td>
                  <td className="px-2 py-2">
                    {isComparison ? (
                      <div className="py-1">
                        {meta === undefined ? notSet : itemText(meta.item)}
                      </div>
                    ) : (
                      <Controller
                        control={control}
                        name={`lines.${index}.itemId`}
                        render={({ field }) => (
                          <RemotePicker<ItemOption>
                            id={`line-${index}-item`}
                            placeholder={t.selectItem}
                            selectedLabel={
                              lineMeta[field.value] === undefined
                                ? null
                                : itemText(lineMeta[field.value]!.item)
                            }
                            unavailableText={t.itemsUnavailable}
                            load={loadItems}
                            optionKey={(option) => option.item.id}
                            optionLabel={(option) => itemText(option.item)}
                            isSelected={(option) => option.item.id === field.value}
                            invalid={rowErrors?.itemId !== undefined}
                            onSelect={(option) => {
                              onItemChosen(option);
                              field.onChange(option.item.id);
                              field.onBlur();

                              // GST % starts from the item master when set (CQ-99).
                              if (
                                getValues(`lines.${index}.gstRate`).trim().length === 0 &&
                                option.defaultGstRate !== null
                              ) {
                                setValue(`lines.${index}.gstRate`, option.defaultGstRate, {
                                  shouldDirty: true,
                                });
                              }
                            }}
                          />
                        )}
                      />
                    )}
                    {rowErrors?.itemId?.message ? (
                      <p className="mt-1 text-xs text-danger">{rowErrors.itemId.message}</p>
                    ) : null}
                    {hint === null ? null : (
                      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                    )}
                  </td>
                  <td className="px-2 py-3">{meta?.item.unitCode ?? notSet}</td>
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
                      aria-label={t.columnLineRemarks}
                      {...register(`lines.${index}.remarks`)}
                    />
                  </td>
                  <td className="px-2 py-3 text-right">
                    {lineTotal === null ? notSet : formatINR(lineTotal)}
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
      {isComparison ? (
        removedRows.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t.addBackHint}</p>
            <div className="flex flex-wrap gap-2">
              {removedRows.map((row) => (
                <Button
                  key={row.comparisonLineId}
                  type="button"
                  variant="outline"
                  onClick={() => append(lineFromRow(row))}
                >
                  <Plus className="size-4" aria-hidden />
                  {itemText(row.item)}
                </Button>
              ))}
            </div>
          </div>
        )
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={fields.length >= MAX_PURCHASE_ORDER_LINES}
            onClick={() => append(EMPTY_LINE)}
          >
            <Plus className="size-4" aria-hidden />
            {t.addLine}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChargesEditor() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<Values>();
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

function TermsEditor() {
  const { control, register } = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control, name: 'terms' });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.termsHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-2xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
              <th className="w-56 px-2 py-2 font-medium">{t.columnTermTitle}</th>
              <th className="px-2 py-2 font-medium">{t.columnTermText}</th>
              <th className="w-12 px-2 py-2" aria-label={t.removeTerm} />
            </tr>
          </thead>
          <tbody>
            {fields.map((row, index) => (
              <tr key={row.id} className="border-b border-border align-top">
                <td className="px-2 py-3">{index + 1}</td>
                <td className="px-2 py-2">
                  <Input aria-label={t.columnTermTitle} {...register(`terms.${index}.title`)} />
                </td>
                <td className="px-2 py-2">
                  <Input aria-label={t.columnTermText} {...register(`terms.${index}.text`)} />
                </td>
                <td className="px-2 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.removeTerm}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={fields.length >= MAX_PURCHASE_ORDER_TERMS}
          onClick={() => append({ title: '', text: '' })}
        >
          <Plus className="size-4" aria-hidden />
          {t.addTerm}
        </Button>
      </div>
    </div>
  );
}

function TotalsPanel({ vendorDetails }: { vendorDetails: PurchaseOrderVendorDetails | null }) {
  const { taxType, totals } = usePreview(vendorDetails);
  const gstRows =
    taxType === 'CGST_SGST'
      ? [
          { label: t.totalCgst, value: formatINR(totals.cgstTotal) },
          { label: t.totalSgst, value: formatINR(totals.sgstTotal) },
        ]
      : taxType === 'IGST'
        ? [{ label: t.totalIgst, value: formatINR(totals.igstTotal) }]
        : [];

  return (
    <div className="flex flex-col gap-2">
      <KeyValueGrid
        columns={2}
        items={[
          { label: t.fieldTaxType, value: taxType === null ? notSet : t.taxTypes[taxType] },
          { label: t.totalSubtotal, value: formatINR(totals.subtotal) },
          { label: t.totalCharges, value: formatINR(totals.chargesAmount) },
          ...gstRows,
          { label: t.totalTax, value: formatINR(totals.taxTotal) },
          { label: t.totalGrand, value: formatINR(totals.grandTotal) },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        {taxType === null ? t.taxTypeUnknown : t.totalsHint}
      </p>
    </div>
  );
}
