import { cache } from 'react';
import { cookies } from 'next/headers';
import { MeResponse, SESSION_COOKIE_NAME } from '@uie/contracts';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

/**
 * Server-only: asks the API who the current user is by forwarding the incoming session cookie.
 * Returns null when there is no valid session. Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token === undefined || token.length === 0) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Session lookup failed with status ${response.status}`);
  }

  const parsed = MeResponse.safeParse(await response.json());

  return parsed.success ? parsed.data : null;
});
