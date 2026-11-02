import {
  PurchaseOrderComparisonFormResponse,
  PurchaseOrderFormOptionsResponse,
} from '@uie/contracts';
import { z } from 'zod';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { buildQueryString, firstValue, type SearchParams } from '@/lib/list-params';
import { PurchaseOrderChooser } from '../_components/purchase-order-chooser';
import { PurchaseOrderForm } from '../purchase-order-form';

const t = terminology.purchaseOrders;

function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await requirePermission('purchase.purchaseOrders.manage'))) {
    return <NotAuthorised />;
  }

  const raw = await searchParams;
  const direct = firstValue(raw.source) === 'direct';
  const comparisonId = firstValue(raw.comparisonId) ?? '';
  const vendorId = firstValue(raw.vendorId) ?? '';
  const fromComparison = isUuid(comparisonId) && isUuid(vendorId);

  if (!direct && !fromComparison) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t.newTitle} subtitle={t.chooseHint} />
        <PurchaseOrderChooser />
      </div>
    );
  }

  const options = await apiGet(
    '/api/purchase-orders/form-options',
    PurchaseOrderFormOptionsResponse,
  );

  if (options.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.formUnavailable} />;
  }

  if (direct) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t.newTitle} subtitle={t.startDirect} />
        <PurchaseOrderForm mode={{ kind: 'direct' }} formOptions={options.data} />
      </div>
    );
  }

  const prefill = await apiGet(
    `/api/purchase-orders/comparison-form?${buildQueryString({ comparisonId, vendorId })}`,
    PurchaseOrderComparisonFormResponse,
  );

  if (prefill.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (prefill.kind !== 'ok') {
    return <ErrorState description={t.comparisonFormUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.newTitle} subtitle={prefill.data.comparison.number} />
      <PurchaseOrderForm
        mode={{ kind: 'comparison', prefill: prefill.data }}
        formOptions={options.data}
      />
    </div>
  );
}
