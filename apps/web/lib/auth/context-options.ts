import { ContextOptionsResponse } from '@uie/contracts';
import { apiGet } from '@/lib/api/server';
import { EMPTY_CONTEXT_OPTIONS } from '@/lib/context';

/** Server-only: the companies and projects the user may choose as working context. */
export async function getContextOptions(): Promise<ContextOptionsResponse> {
  const result = await apiGet('/api/auth/context/options', ContextOptionsResponse);

  // The switchers are a convenience: if the list cannot be loaded they are disabled, not an error page.
  return result.kind === 'ok' ? result.data : EMPTY_CONTEXT_OPTIONS;
}
