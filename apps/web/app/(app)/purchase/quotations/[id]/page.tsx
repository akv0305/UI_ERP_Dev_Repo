import { QuotationDetailResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDate, formatDateTime, formatINR, formatQty } from '@/lib/format';
import { codeName, itemText } from '../../enquiries/_components/enquiry-text';
import { QuotationStatusChip } from '../_components/quotation-status-chip';
import {
  actorLine,
  daysText,
  quotationTitle,
  rateText,
  revisionText,
} from '../_components/quotation-text';
import { QuotationActions } from './quotation-actions';

const t = terminology.quotations;
const notSet = terminology.labels.notSet;

function scopeLabel(scope: { code: string; name: string }): string {
  return codeName(scope.code, scope.name);
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.quotations.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/quotations/${encodeURIComponent(id)}`, QuotationDetailResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const quotation = result.data;

  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${quotation.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const edit = quotation.canEdit ? (
    <Button asChild variant="outline">
      <Link href={`/purchase/quotations/${quotation.id}/edit`}>{t.edit}</Link>
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={quotationTitle(quotation, t.unnumbered)}
        subtitle={codeName(quotation.vendor.code, quotation.vendor.legalName)}
        actions={
          <>
            {history}
            {edit}
            <QuotationActions quotation={quotation} />
          </>
        }
      />
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionStatus}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.infoStatus, value: <QuotationStatusChip status={quotation.status} /> },
            {
              label: t.infoRevision,
              value: revisionText(quotation.revisionNo, t.revisionOriginal),
            },
            {
              label: t.infoCreatedBy,
              value: actorLine(quotation.createdBy, quotation.createdAt, notSet),
            },
            {
              label: t.infoSubmitted,
              value: actorLine(quotation.submittedBy, quotation.submittedAt, notSet),
            },
            {
              label: t.infoSuperseded,
              value:
                quotation.supersededAt === null ? notSet : formatDateTime(quotation.supersededAt),
            },
            {
              label: t.infoCancelled,
              value: actorLine(quotation.cancelledBy, quotation.cancelledAt, notSet),
            },
            { label: t.infoCancelRemarks, value: quotation.cancelRemarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionHeader}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.fieldCompany, value: scopeLabel(quotation.company) },
            { label: t.fieldProject, value: scopeLabel(quotation.project) },
            { label: t.fieldSite, value: scopeLabel(quotation.site) },
            {
              label: t.fieldEnquiry,
              value: (
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/purchase/enquiries/${quotation.enquiry.id}`}
                >
                  {quotation.enquiry.number}
                </Link>
              ),
            },
            {
              label: t.fieldVendor,
              value: codeName(quotation.vendor.code, quotation.vendor.legalName),
            },
            { label: t.fieldVendorQuoteRef, value: quotation.vendorQuoteRef ?? notSet },
            { label: t.fieldQuoteDate, value: formatDate(quotation.quoteDate) },
            {
              label: t.fieldValidUntil,
              value: quotation.validUntil === null ? notSet : formatDate(quotation.validUntil),
            },
            {
              label: t.fieldDeliveryDays,
              value: daysText(quotation.deliveryDays, t.daysSuffix, notSet),
            },
            {
              label: t.fieldPaymentTermsDays,
              value: daysText(quotation.paymentTermsDays, t.daysSuffix, notSet),
            },
            { label: t.fieldRemarks, value: quotation.remarks ?? notSet },
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
                <th className="w-16 px-2 py-2 font-medium">{t.columnQuoted}</th>
                <th className="w-28 px-2 py-2 text-right font-medium">{t.columnRate}</th>
                <th className="w-20 px-2 py-2 text-right font-medium">{t.columnDiscount}</th>
                <th className="w-20 px-2 py-2 text-right font-medium">{t.columnGst}</th>
                <th className="w-32 px-2 py-2 font-medium">{t.columnMakeBrand}</th>
                <th className="w-32 px-2 py-2 font-medium">{t.columnLineRemarks}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnLineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((line) => (
                <tr key={line.id} className="border-b border-border align-top">
                  <td className="px-2 py-2">{line.lineNo}</td>
                  <td className="px-2 py-2">{itemText(line.item)}</td>
                  <td className="px-2 py-2">{line.item.unitCode}</td>
                  <td className="px-2 py-2 text-right">
                    {formatQty(line.quantity, line.item.decimalPlaces)}
                  </td>
                  <td className="px-2 py-2">
                    {line.isQuoted ? terminology.labels.yes : terminology.labels.no}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {line.rate === null ? notSet : rateText(line.rate)}
                  </td>
                  <td className="px-2 py-2 text-right">{line.discountPercent ?? notSet}</td>
                  <td className="px-2 py-2 text-right">{line.gstRate ?? notSet}</td>
                  <td className="px-2 py-2">{line.makeBrand ?? notSet}</td>
                  <td className="px-2 py-2">{line.remarks ?? notSet}</td>
                  <td className="px-2 py-2 text-right">
                    {line.lineTotal === null ? notSet : formatINR(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionCharges}</h2>
        {quotation.charges.length === 0 ? (
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
                  <th className="w-32 px-2 py-2 text-right font-medium">{t.columnChargeTax}</th>
                </tr>
              </thead>
              <tbody>
                {quotation.charges.map((charge) => (
                  <tr key={charge.id} className="border-b border-border">
                    <td className="px-2 py-2">{t.chargeTypes[charge.chargeType]}</td>
                    <td className="px-2 py-2">{charge.description ?? notSet}</td>
                    <td className="px-2 py-2 text-right">{formatINR(charge.amount)}</td>
                    <td className="px-2 py-2 text-right">{charge.gstRate}</td>
                    <td className="px-2 py-2 text-right">{formatINR(charge.taxAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionTotals}</h2>
        <KeyValueGrid
          columns={2}
          items={[
            { label: t.totalSubtotal, value: formatINR(quotation.subtotal) },
            { label: t.totalTax, value: formatINR(quotation.taxTotal) },
            { label: t.totalCharges, value: formatINR(quotation.chargesTotal) },
            { label: t.totalGrand, value: formatINR(quotation.grandTotal) },
          ]}
        />
      </section>
    </div>
  );
}
