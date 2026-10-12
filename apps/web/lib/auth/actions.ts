'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME } from '@uie/contracts';
import type { ContextChange } from '@/lib/context';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

/** Revokes the session on the API, clears the cookie and goes to the login page. */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token !== undefined && token.length > 0) {
    try {
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
        cache: 'no-store',
      });
    } catch {
      // The cookie is cleared below either way; an unreachable API must not trap the user.
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}

/**
 * Saves the working company / project on the session (PUT /api/auth/context).
 * Resolves true when the API accepted it; the caller then refreshes the page data.
 */
export async function changeContext(change: ContextChange): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token === undefined || token.length === 0) {
    return false;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/context`, {
      method: 'PUT',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(change),
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
  }
}
