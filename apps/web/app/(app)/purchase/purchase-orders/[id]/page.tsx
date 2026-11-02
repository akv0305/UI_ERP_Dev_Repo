import { PurchaseOrderDetailResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { codeName, itemText } from '../../enquiries/_components/enquiry-text';
import { actorLine, daysText, rateText } from '../../quotations/_components/quotation-text';
import { PurchaseOrderStatusChip } from '../_components/purchase-order-status-chip';
import {
  percentText,
  purchaseOrderTitle,
  referenceHint,
  termText,
} from '../_components/purchase-order-text';

const t = terminology.purchaseOrders;
const notSet = terminology.labels.notSet;
const linkClass = 'text-primary underline-offset-4 hover:underline';

function scopeLabel(scope: { code: string; name: string }): string {
  return codeName(scope.code, scope.name);
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.purchaseOrders.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(
    `/api/purchase-orders/${encodeURIComponent(id)}`,
    PurchaseOrderDetailResponse,
  );

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const po = result.data;
  const splitGst = po.taxType === 'CGST_SGST';
  const integratedGst = po.taxType === 'IGST';

  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${po.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;

  const edit = po.canEdit ? (
    <Button asChild variant="outline">
      <Link href={`/purchase/purchase-orders/${po.id}/edit`}>{t.edit}</Link>
    </Button>
  ) : null;

  const gstTotals = splitGst
    ? [
        { label: t.totalCgst, value: formatINR(po.cgstTotal) },
        { label: t.totalSgst, value: formatINR(po.sgstTotal) },
      ]
    : integratedGst
      ? [{ label: t.totalIgst, value: formatINR(po.igstTotal) }]
      : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={purchaseOrderTitle(po)}
        subtitle={codeName(po.vendor.code, po.vendor.legalName)}
        actions={
          <>
            {history}
            {edit}
          </>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionStatus}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.infoStatus, value: <PurchaseOrderStatusChip status={po.status} /> },
            { label: t.infoSource, value: t.sources[po.source] },
            { label: t.infoCreatedBy, value: actorLine(po.createdBy, po.createdAt, notSet) },
            { label: t.infoSubmitted, value: actorLine(po.submittedBy, po.submittedAt, notSet) },
            { label: t.infoCancelled, value: actorLine(po.cancelledBy, po.cancelledAt, notSet) },
            { label: t.infoCancelRemarks, value: po.cancelRemarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionHeader}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.fieldCompany, value: scopeLabel(po.company) },
            { label: t.fieldProject, value: scopeLabel(po.project) },
            { label: t.fieldSite, value: scopeLabel(po.site) },
            { label: t.fieldStore, value: po.store === null ? t.noStore : scopeLabel(po.store) },
            {
              label: t.fieldComparison,
              value:
                po.comparison === null ? (
                  notSet
                ) : (
                  <Link className={linkClass} href={`/purchase/comparisons/${po.comparison.id}`}>
                    {po.comparison.number}
                  </Link>
                ),
            },
            {
              label: t.fieldEnquiry,
              value:
                po.enquiry === null ? (
                  notSet
                ) : (
                  <Link className={linkClass} href={`/purchase/enquiries/${po.enquiry.id}`}>
                    {po.enquiry.number}
                  </Link>
                ),
            },
            { label: t.fieldVendor, value: codeName(po.vendor.code, po.vendor.legalName) },
            { label: t.fieldVendorGstin, value: po.vendorGstin ?? t.unregistered },
            { label: t.fieldVendorContact, value: po.vendorContactName ?? notSet },
            { label: t.fieldBillingGstin, value: po.billingGstin },
            { label: t.fieldTaxType, value: t.taxTypes[po.taxType] },
            { label: t.fieldPoDate, value: formatDate(po.poDate) },
            { label: t.fieldSubject, value: po.subject },
            { label: t.fieldVendorQuoteRef, value: po.vendorQuoteRef ?? notSet },
            {
              label: t.fieldVendorQuoteDate,
              value: po.vendorQuoteDate === null ? notSet : formatDate(po.vendorQuoteDate),
            },
            {
              label: t.fieldDeliveryDate,
              value: po.deliveryDate === null ? notSet : formatDate(po.deliveryDate),
            },
            {
              label: t.fieldPaymentTermsDays,
              value: daysText(po.paymentTermsDays, t.daysSuffix, notSet),
            },
            { label: t.fieldRemarks, value: po.remarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionLines}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-5xl text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
                <th className="px-2 py-2 font-medium">{t.columnItem}</th>
                <th className="w-16 px-2 py-2 font-medium">{t.columnUnit}</th>
                <th className="w-24 px-2 py-2 text-right font-medium">{t.columnQuantity}</th>
                <th className="w-28 px-2 py-2 text-right font-medium">{t.columnRate}</th>
                <th className="w-20 px-2 py-2 text-right font-medium">{t.columnDiscount}</th>
                <th className="w-20 px-2 py-2 text-right font-medium">{t.columnGst}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnTaxable}</th>
                {splitGst ? (
                  <>
                    <th className="w-28 px-2 py-2 text-right font-medium">{t.columnCgst}</th>
                    <th className="w-28 px-2 py-2 text-right font-medium">{t.columnSgst}</th>
                  </>
                ) : null}
                {integratedGst ? (
                  <th className="w-28 px-2 py-2 text-right font-medium">{t.columnIgst}</th>
                ) : null}
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnLineTotal}</th>
                <th className="w-32 px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line) => {
                const hint = referenceHint(line);

                return (
                  <tr key={line.id} className="border-b border-border align-top">
                    <td className="px-2 py-2">{line.lineNo}</td>
                    <td className="px-2 py-2">
                      {itemText(line.item)}
                      {hint === null ? null : (
                        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                      )}
                    </td>
                    <td className="px-2 py-2">{line.item.unitCode}</td>
                    <td className="px-2 py-2 text-right">
                      {formatQty(line.quantity, line.item.decimalPlaces)}
                    </td>
                    <td className="px-2 py-2 text-right">{rateText(line.rate)}</td>
                    <td className="px-2 py-2 text-right">{line.discountPercent}</td>
                    <td className="px-2 py-2 text-right">{line.gstRate}</td>
                    <td className="px-2 py-2 text-right">{formatINR(line.taxableAmount)}</td>
                    {splitGst ? (
                      <>
                        <td className="px-2 py-2 text-right">{formatINR(line.cgstAmount)}</td>
                        <td className="px-2 py-2 text-right">{formatINR(line.sgstAmount)}</td>
                      </>
                    ) : null}
                    {integratedGst ? (
                      <td className="px-2 py-2 text-right">{formatINR(line.igstAmount)}</td>
                    ) : null}
                    <td className="px-2 py-2 text-right">{formatINR(line.lineTotal)}</td>
                    <td className="px-2 py-2">{line.remarks ?? notSet}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionCharges}</h2>
        {po.charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noCharges}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-48 px-2 py-2 font-medium">{t.columnCharge}</th>
                  <th className="px-2 py-2 font-medium">{t.columnChargeDescription}</th>
                  <th className="w-32 px-2 py-2 text-right font-medium">{t.columnAmount}</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">{t.columnGst}</th>
                  {splitGst ? (
                    <>
                      <th className="w-28 px-2 py-2 text-right font-medium">{t.columnCgst}</th>
                      <th className="w-28 px-2 py-2 text-right font-medium">{t.columnSgst}</th>
                    </>
                  ) : null}
                  {integratedGst ? (
                    <th className="w-28 px-2 py-2 text-right font-medium">{t.columnIgst}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {po.charges.map((charge) => (
                  <tr key={charge.id} className="border-b border-border">
                    <td className="px-2 py-2">{t.chargeTypes[charge.chargeType]}</td>
                    <td className="px-2 py-2">{charge.description ?? notSet}</td>
                    <td className="px-2 py-2 text-right">{formatINR(charge.amount)}</td>
                    <td className="px-2 py-2 text-right">{percentText(charge.gstRate)}</td>
                    {splitGst ? (
                      <>
                        <td className="px-2 py-2 text-right">{formatINR(charge.cgstAmount)}</td>
                        <td className="px-2 py-2 text-right">{formatINR(charge.sgstAmount)}</td>
                      </>
                    ) : null}
                    {integratedGst ? (
                      <td className="px-2 py-2 text-right">{formatINR(charge.igstAmount)}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionTerms}</h2>
        {po.terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noTerms}</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {po.terms.map((term) => (
              <li key={term.id}>{termText(term)}</li>
            ))}
          </ol>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionTotals}</h2>
        <KeyValueGrid
          columns={2}
          items={[
            { label: t.totalSubtotal, value: formatINR(po.subtotal) },
            { label: t.totalCharges, value: formatINR(po.chargesAmount) },
            ...gstTotals,
            { label: t.totalTax, value: formatINR(po.taxTotal) },
            { label: t.totalGrand, value: formatINR(po.grandTotal) },
          ]}
        />
      </section>
    </div>
  );
}
