import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface KeyValueItem {
  label: string;
  value: ReactNode;
}

export interface KeyValueGridProps {
  items: KeyValueItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}

const columnClasses: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

export function KeyValueGrid({ items, columns = 2, className }: KeyValueGridProps) {
  return (
    <dl className={cn('grid gap-[var(--card-padding)]', columnClasses[columns], className)}>
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">{item.label}</dt>
          <dd className="text-sm text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
