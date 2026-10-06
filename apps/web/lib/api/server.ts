import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME } from '@uie/contracts';
import type { ZodType } from 'zod';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

export type ApiGetResult<T> =
  { kind: 'ok'; data: T } | { kind: 'forbidden' } | { kind: 'notFound' } | { kind: 'error' };

/**
 * Server-only GET against the API, forwarding the session cookie.
 * A missing/expired session sends the user to the login page.
 */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<ApiGetResult<T>> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token === undefined || token.length === 0) {
    redirect('/login');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      cache: 'no-store',
    });
  } catch {
    return { kind: 'error' };
  }

  if (response.status === 401) {
    redirect('/login');
  }

  if (response.status === 403) {
    return { kind: 'forbidden' };
  }

  if (response.status === 404) {
    return { kind: 'notFound' };
  }

  if (!response.ok) {
    return { kind: 'error' };
  }

  const parsed = schema.safeParse(await response.json());

  return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'error' };
}
