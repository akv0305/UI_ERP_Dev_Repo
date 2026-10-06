import type { HealthResponse } from '@uie/contracts';
import { terminology } from '@/config/terminology';

export function HealthFields({ data }: { data: HealthResponse }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{terminology.fields.status}</dt>
      <dd className="font-mono">{data.status}</dd>
      <dt className="text-muted-foreground">{terminology.fields.service}</dt>
      <dd className="font-mono">{data.service}</dd>
      <dt className="text-muted-foreground">{terminology.fields.version}</dt>
      <dd className="font-mono">{data.version}</dd>
      <dt className="text-muted-foreground">{terminology.fields.time}</dt>
      <dd className="font-mono">{data.time}</dd>
    </dl>
  );
}
