import { terminology } from '@/config/terminology';
import { messageForApiError } from '@/lib/api/client';

/** Purchase order wording first; shared API messages otherwise. */
export function purchaseOrderErrorMessage(code: string | undefined): string {
  const own =
    code === undefined
      ? undefined
      : (terminology.purchaseOrders.apiErrors as Record<string, string>)[code];

  return own ?? messageForApiError(code);
}
