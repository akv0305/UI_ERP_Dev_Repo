import { Lock } from 'lucide-react';
import { terminology } from '@/config/terminology';

export function NotAuthorised() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface p-10 text-center">
      <Lock className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{terminology.messages.notAuthorised}</p>
    </div>
  );
}
