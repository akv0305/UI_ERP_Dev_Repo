'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';

export interface NotificationBellProps {
  count: number;
}

export function NotificationBell({ count }: NotificationBellProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={terminology.shell.notifications}
    >
      <Bell className="size-4" aria-hidden />
      {count > 0 ? (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-xs font-medium text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  );
}
