import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-danger/40 bg-surface p-10 text-center">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        {title ?? terminology.messages.genericError}
      </p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-2">
          {terminology.actions.retry}
        </Button>
      ) : null}
    </div>
  );
}
