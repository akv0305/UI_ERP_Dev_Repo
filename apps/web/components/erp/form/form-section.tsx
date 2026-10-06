import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormSectionProps {
  title: string;
  description?: string;
  columns?: 1 | 2 | 3;
  children: ReactNode;
  className?: string;
}

const columnClasses: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

export function FormSection({
  title,
  description,
  columns = 2,
  children,
  className,
}: FormSectionProps) {
  return (
    <fieldset
      className={cn(
        'rounded-lg border border-border bg-surface p-[var(--card-padding)]',
        className,
      )}
    >
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {description ? <p className="mb-3 text-xs text-muted-foreground">{description}</p> : null}
      <div className={cn('grid gap-4', columnClasses[columns])}>{children}</div>
    </fieldset>
  );
}
