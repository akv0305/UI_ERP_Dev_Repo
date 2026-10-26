import { EnquiryDetailResponse } from '@uie/contracts';
import Link from 'next/link';
import { ErrorState, KeyValueGrid, NotAuthorised, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { EnquiryStatusChip } from '../_components/enquiry-status-chip';
import { codeName, indentLineRef, itemText } from '../_components/enquiry-text';

const t = terminology.enquiries;
const notSet = terminology.labels.notSet;

function actorLine(actor: { displayName: string } | null, at: string | null): string {
  if (at === null) {
    return notSet;
  }

  return actor === null ? formatDateTime(at) : `${actor.displayName}, ${formatDateTime(at)}`;
}

function scopeLabel(scope: { code: string; name: string }): string {
  return codeName(scope.code, scope.name);
}

export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await getCurrentPermissions();

  if (!permissions.includes('purchase.enquiries.view')) {
    return <NotAuthorised />;
  }

  const { id } = await params;
  const result = await apiGet(`/api/enquiries/${encodeURIComponent(id)}`, EnquiryDetailResponse);

  if (result.kind === 'forbidden') {
    return <NotAuthorised />;
  }

  if (result.kind === 'notFound') {
    return <ErrorState description={t.notFound} />;
  }

  if (result.kind !== 'ok') {
    return <ErrorState description={t.loadError} />;
  }

  const enquiry = result.data;

  const history = permissions.includes('administration.auditLog.view') ? (
    <Button asChild variant="outline">
      <Link href={`/administration/audit-log?entityId=${enquiry.id}`}>
        {terminology.masters.viewHistory}
      </Link>
    </Button>
  ) : null;
  const edit = enquiry.canEdit ? (
    <Button asChild variant="outline">
      <Link href={`/purchase/enquiries/${enquiry.id}/edit`}>{t.edit}</Link>
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={enquiry.number ?? t.unnumbered}
        subtitle={scopeLabel(enquiry.project)}
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
            { label: t.infoStatus, value: <EnquiryStatusChip status={enquiry.status} /> },
            { label: t.infoCreatedBy, value: actorLine(enquiry.createdBy, enquiry.createdAt) },
            { label: t.infoSent, value: actorLine(enquiry.sentBy, enquiry.sentAt) },
            { label: t.infoClosed, value: actorLine(enquiry.closedBy, enquiry.closedAt) },
            { label: t.infoCancelled, value: actorLine(enquiry.cancelledBy, enquiry.cancelledAt) },
            { label: t.infoCancelRemarks, value: enquiry.cancelRemarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionHeader}</h2>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t.fieldCompany, value: scopeLabel(enquiry.company) },
            { label: t.fieldProject, value: scopeLabel(enquiry.project) },
            { label: t.fieldSite, value: scopeLabel(enquiry.site) },
            { label: t.fieldEnquiryDate, value: formatDate(enquiry.enquiryDate) },
            { label: t.fieldQuoteDueDate, value: formatDate(enquiry.quoteDueDate) },
            { label: t.fieldTerms, value: enquiry.terms ?? notSet },
            { label: t.fieldRemarks, value: enquiry.remarks ?? notSet },
          ]}
        />
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionVendors}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-40 px-2 py-2 font-medium">{t.columnVendorCode}</th>
                <th className="px-2 py-2 font-medium">{t.columnVendorName}</th>
              </tr>
            </thead>
            <tbody>
              {enquiry.vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-border">
                  <td className="px-2 py-2">{vendor.code}</td>
                  <td className="px-2 py-2">{vendor.legalName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t.sectionLines}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
                <th className="w-48 px-2 py-2 font-medium">{t.columnIndentLine}</th>
                <th className="px-2 py-2 font-medium">{t.columnItem}</th>
                <th className="w-20 px-2 py-2 font-medium">{t.columnUnit}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnApprovedQty}</th>
                <th className="w-32 px-2 py-2 text-right font-medium">{t.columnQuantity}</th>
                <th className="px-2 py-2 font-medium">{t.columnLineRemarks}</th>
              </tr>
            </thead>
            <tbody>
              {enquiry.lines.map((line) => (
                <tr key={line.id} className="border-b border-border align-top">
                  <td className="px-2 py-2">{line.lineNo}</td>
                  <td className="px-2 py-2">
                    {indentLineRef(line.indentLine.indentNumber, line.indentLine.lineNo)}
                  </td>
                  <td className="px-2 py-2">{itemText(line.item)}</td>
                  <td className="px-2 py-2">{line.item.unitCode}</td>
                  <td className="px-2 py-2 text-right">
                    {formatQty(line.indentLine.approvedQty, line.item.decimalPlaces)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {formatQty(line.quantity, line.item.decimalPlaces)}
                  </td>
                  <td className="px-2 py-2">{line.remarks ?? notSet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
