import type { NotificationResponse } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { formatDateTime } from '@/lib/format';

/** Display helpers for the bell and the Home approval tables (kept out of JSX for react/jsx-no-literals). */

const t = terminology.notificationCenter;

export function poNumberText(po: { number: string | null; revisionNo: number }): string {
  const number = po.number ?? terminology.purchaseOrders.unnumbered;

  return po.revisionNo > 0 ? `${number} ${t.revisionPrefix}${po.revisionNo}` : number;
}

export function badgeText(count: number): string {
  return count > 9 ? t.badgeOverflow : String(count);
}

export function levelText(levelNo: number, roleName: string, routed: boolean): string {
  const text = `${t.levelPrefix} ${levelNo}${t.separator}${roleName}`;

  return routed ? `${text} ${t.routedSuffix}` : text;
}

export function actorAtText(
  actor: { displayName: string } | null,
  at: string | null,
  notSet: string,
): string {
  if (at === null) {
    return notSet;
  }

  return actor === null
    ? formatDateTime(at)
    : `${actor.displayName}${t.separator}${formatDateTime(at)}`;
}

export function notificationDetail(item: NotificationResponse): string {
  const parts: string[] = [];

  if (item.purchaseOrder !== null) {
    parts.push(poNumberText(item.purchaseOrder), item.purchaseOrder.vendorName);
  }

  if (item.levelNo !== null) {
    parts.push(`${t.levelPrefix} ${item.levelNo}`);
  }

  parts.push(formatDateTime(item.createdAt));

  return parts.join(t.separator);
}
