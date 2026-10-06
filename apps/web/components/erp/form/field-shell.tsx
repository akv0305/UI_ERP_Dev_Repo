import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';

export interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function FieldShell({
  id,
  label,
  required,
  description,
  error,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            {terminology.labels.requiredMark}
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
