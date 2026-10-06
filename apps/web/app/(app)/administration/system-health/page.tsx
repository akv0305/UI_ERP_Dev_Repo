import { HealthResponse } from '@uie/contracts';
import { NotAuthorised, PageHeader } from '@/components/erp';
import { terminology } from '@/config/terminology';
import { getCurrentPermissions } from '@/lib/auth/permissions';
import { HealthClient } from './health-client';
import { HealthFields } from './health-fields';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

async function fetchServerHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/health`, { cache: 'no-store' });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    const parsed = HealthResponse.safeParse(payload);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function SystemHealthPage() {
  if (!getCurrentPermissions().includes('administration.systemHealth.view')) {
    return <NotAuthorised />;
  }

  const health = await fetchServerHealth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={terminology.nav.systemHealth} subtitle={terminology.home.intro} />

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-1 text-lg font-medium">{terminology.home.serverSectionTitle}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{terminology.home.serverSectionHint}</p>

        {health ? (
          <HealthFields data={health} />
        ) : (
          <p className="text-sm text-destructive">{terminology.messages.serverUnavailable}</p>
        )}
      </section>

      <HealthClient />
    </div>
  );
}
