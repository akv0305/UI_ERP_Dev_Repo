import { terminology } from '@/config/terminology';

export type ApiCallResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string | undefined };

/** Browser-side call through the Next rewrite (same origin, so the session cookie is sent). */
export async function apiRequest<T = undefined>(
  method: 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<ApiCallResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      const data = response.status === 204 ? undefined : ((await response.json()) as T);

      return { ok: true, data: data as T };
    }

    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;

    return { ok: false, status: response.status, code: payload?.error?.code };
  } catch {
    return { ok: false, status: 0, code: undefined };
  }
}

/** Maps an API error code to the on-screen message. */
export function messageForApiError(code: string | undefined): string {
  const messages = terminology.apiErrors as Record<string, string>;

  return (code !== undefined ? messages[code] : undefined) ?? terminology.messages.genericError;
}
