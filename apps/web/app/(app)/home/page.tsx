import { ApprovalInboxResponse, type ApprovalInboxItem } from '@uie/contracts';
import Link from 'next/link';
import { EmptyState, ErrorState, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { apiGet } from '@/lib/api/server';
import { formatDateTime, formatINR } from '@/lib/format';
import { actorAtText, levelText, poNumberText } from '@/lib/notification-text';

const t = terminology.homeInbox;
const notSet = terminology.labels.notSet;
const linkClass = 'text-primary underline-offset-4 hover:underline';
const headClass = 'px-2 py-2 font-medium';

function InboxTable({ items }: { items: ApprovalInboxItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-4xl text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className={headClass}>{t.columnPurchaseOrder}</th>
            <th className={headClass}>{t.columnProject}</th>
            <th className={headClass}>{t.columnVendor}</th>
            <th className={headClass}>{t.columnLevel}</th>
            <th className={`${headClass} text-right`}>{t.columnNetAmount}</th>
            <th className={`${headClass} text-right`}>{t.columnGrandTotal}</th>
            <th className={headClass}>{t.columnSubmitted}</th>
            <th className={headClass}>{t.columnWaitingSince}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.purchaseOrder.id}-${item.levelNo}`}
              className="border-b border-border align-top"
            >
              <td className="px-2 py-2">
                <Link
                  className={linkClass}
                  href={`/purchase/purchase-orders/${item.purchaseOrder.id}`}
                >
                  {poNumberText(item.purchaseOrder)}
                </Link>
              </td>
              <td className="px-2 py-2">{item.purchaseOrder.projectCode}</td>
              <td className="px-2 py-2">{item.purchaseOrder.vendorName}</td>
              <td className="px-2 py-2">{levelText(item.levelNo, item.role.name, item.routed)}</td>
              <td className="px-2 py-2 text-right">{formatINR(item.purchaseOrder.subtotal)}</td>
              <td className="px-2 py-2 text-right">{formatINR(item.purchaseOrder.grandTotal)}</td>
              <td className="px-2 py-2">
                {actorAtText(
                  item.purchaseOrder.submittedBy,
                  item.purchaseOrder.submittedAt,
                  notSet,
                )}
              </td>
              <td className="px-2 py-2">
                {item.assignedAt === null ? notSet : formatDateTime(item.assignedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Home: approvals waiting for the signed-in user; levels on hold for an Administrator (OQ-118, OQ-131). */
export default async function HomePage() {
  const result = await apiGet('/api/approvals/awaiting-me', ApprovalInboxResponse);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={terminology.nav.home} />
      {result.kind !== 'ok' ? (
        <ErrorState description={t.loadError} />
      ) : (
        <>
          <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{t.awaitingTitle}</h2>
            {result.data.awaitingMe.length === 0 ? (
              <EmptyState title={t.awaitingEmpty} />
            ) : (
              <InboxTable items={result.data.awaitingMe} />
            )}
          </section>
          {result.data.onHold === null ? null : (
            <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
              <h2 className="mb-1 text-sm font-semibold text-foreground">{t.onHoldTitle}</h2>
              <p className="mb-3 text-sm text-muted-foreground">{t.onHoldHint}</p>
              {result.data.onHold.length === 0 ? (
                <EmptyState title={t.onHoldEmpty} />
              ) : (
                <InboxTable items={result.data.onHold} />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
