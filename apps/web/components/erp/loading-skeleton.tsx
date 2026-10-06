import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';

export type LoadingSkeletonVariant = 'table' | 'form' | 'detail';

export interface LoadingSkeletonProps {
  variant: LoadingSkeletonVariant;
  className?: string;
}

function SkeletonRow({ className }: { className?: string }) {
  return <div className={cn('h-4 animate-pulse rounded-sm bg-surface-muted', className)} />;
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonRow className="h-8 w-full" />
      {[0, 1, 2, 3, 4].map((index) => (
        <SkeletonRow key={index} className="w-full" />
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-2">
          <SkeletonRow className="w-32" />
          <SkeletonRow className="h-[var(--field-height)] w-full" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonRow className="h-6 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <SkeletonRow className="w-24" />
            <SkeletonRow className="w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingSkeleton({ variant, className }: LoadingSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-[var(--card-padding)]',
        className,
      )}
    >
      <span className="sr-only">{terminology.labels.loading}</span>
      {variant === 'table' ? <TableSkeleton /> : null}
      {variant === 'form' ? <FormSkeleton /> : null}
      {variant === 'detail' ? <DetailSkeleton /> : null}
    </div>
  );
}
