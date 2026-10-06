import { HealthResponse } from '@uie/contracts';
import { HealthClient } from '@/app/health-client';
import { HealthFields } from '@/app/health-fields';
import { terminology } from '@/config/terminology';

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

export default async function HomePage() {
  const health = await fetchServerHealth();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{terminology.home.heading}</h1>
        <p className="text-sm text-muted-foreground">{terminology.home.intro}</p>
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="mb-1 text-lg font-medium">{terminology.home.serverSectionTitle}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{terminology.home.serverSectionHint}</p>

        {health ? (
          <HealthFields data={health} />
        ) : (
          <p className="text-sm text-destructive">{terminology.messages.serverUnavailable}</p>
        )}
      </section>

      <HealthClient />
    </main>
  );
}
