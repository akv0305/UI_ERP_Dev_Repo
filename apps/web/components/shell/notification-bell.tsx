'use client';

import { NotificationListResponse, type NotificationResponse } from '@uie/contracts';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { terminology } from '@/config/terminology';
import { apiRead, apiRequest } from '@/lib/api/client';
import { badgeText, notificationDetail } from '@/lib/notification-text';
import { cn } from '@/lib/utils';

const t = terminology.notificationCenter;

export interface NotificationBellProps {
  /** Unread count read by the layout on page load (OQ-129). */
  count: number;
}

type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ok'; data: NotificationListResponse };

export function NotificationBell({ count }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ kind: 'idle' });

  const unread = list.kind === 'ok' ? list.data.unreadCount : count;

  async function load() {
    setList({ kind: 'loading' });
    const result = await apiRead('/api/notifications', NotificationListResponse);
    setList(result.ok ? { kind: 'ok', data: result.data } : { kind: 'error' });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      void load();
    }
  }

  async function openNotification(item: NotificationResponse) {
    if (item.readAt === null) {
      await apiRequest('POST', `/api/notifications/${item.id}/read`);
    }

    setOpen(false);
    setList({ kind: 'idle' });

    if (item.purchaseOrder !== null) {
      router.push(`/purchase/purchase-orders/${item.purchaseOrder.id}`);
    }

    // Re-reads the layout so the badge count is fresh (OQ-129).
    router.refresh();
  }

  async function markAllRead() {
    const result = await apiRequest('POST', '/api/notifications/read-all');

    if (result.ok) {
      await load();
      router.refresh();
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t.title}>
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-medium text-primary-foreground">
              {badgeText(unread)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">{t.title}</p>
          {unread > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()}>
              {t.markAllRead}
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.kind === 'loading' || list.kind === 'idle' ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t.loading}</p>
          ) : null}
          {list.kind === 'error' ? (
            <p className="px-3 py-4 text-sm text-danger">{t.loadError}</p>
          ) : null}
          {list.kind === 'ok' && list.data.items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t.empty}</p>
          ) : null}
          {list.kind === 'ok' && list.data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(item)}
                    className={cn(
                      'flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      item.readAt === null ? 'bg-surface-muted' : '',
                    )}
                  >
                    <span
                      className={cn(
                        'text-foreground',
                        item.readAt === null ? 'font-semibold' : 'font-normal',
                      )}
                    >
                      {t.kinds[item.kind]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {notificationDetail(item)}
                    </span>
                    {item.actionNeeded ? (
                      <span className="text-xs font-medium text-danger">{t.actionNeeded}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
