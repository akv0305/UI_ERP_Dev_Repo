import {
  PurchaseOrderComparisonFormResponse,
  PurchaseOrderDetailResponse,
  PurchaseOrderFormOptionsResponse,
  PurchaseOrderVendorDetails,
} from '@uie/contracts';
import { ErrorState, NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { requirePermission } from '@/lib/auth/require-permission';
import { buildQueryString } from '@/lib/list-params';
import { purchaseOrderTitle } from '../../_components/purchase-order-text';
import { PurchaseOrderForm } from '../../purchase-order-form';

const t = terminology.purchaseOrders;

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requirePermission('purchase.purchaseOrders.manage'))) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const po = await apiGet(
    `/api/purchase-orders/${encodeURIComponent(id)}`,
    PurchaseOrderDetailResponse,
  );

  if (po.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (po.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (po.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const header = <PageHeader title={t.editTitle} subtitle={purchaseOrderTitle(po.data)} />;

  if (!po.data.canEdit) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState description={t.lockedNotice} />
      </div>
    );
  }

  const comparisonId = po.data.comparison?.id ?? null;

  const [options, vendor, comparison] = await Promise.all([
    apiGet('/api/purchase-orders/form-options', PurchaseOrderFormOptionsResponse),
    apiGet(
      `/api/purchase-orders/vendor-details?${buildQueryString({
        vendorId: po.data.vendor.id,
        siteId: po.data.site.id,
      })}`,
      PurchaseOrderVendorDetails,
    ),
    // All lines chosen for this vendor, so removed lines can be added back (PDEF-044).
    comparisonId === null
      ? Promise.resolve(null)
      : apiGet(
          `/api/purchase-orders/comparison-form?${buildQueryString({
            comparisonId,
            vendorId: po.data.vendor.id,
            purchaseOrderId: po.data.id,
          })}`,
          PurchaseOrderComparisonFormResponse,
        ),
  ]);

  if (options.kind === 'forbidden' || vendor.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (options.kind !== 'ok') {
    return <ErrorState description={t.formUnavailable} />;
  }

  if (vendor.kind !== 'ok') {
    return <ErrorState description={t.vendorUnavailable} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      <PurchaseOrderForm
        mode={{
          kind: 'edit',
          purchaseOrder: po.data,
          vendor: vendor.data,
          // If the comparison lines cannot be loaded, only the saved lines are offered (as before).
          comparison: comparison !== null && comparison.kind === 'ok' ? comparison.data : null,
        }}
        formOptions={options.data}
      />
    </div>
  );
}
