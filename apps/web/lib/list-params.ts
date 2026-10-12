export type SearchParams = Record<string, string | string[] | undefined>;

/** Value used by filter selects for "no filter". */
export const ALL_VALUE = 'all';

export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Query string from key/values; empty, undefined and "all" values are left out. */
export function buildQueryString(
  values: Record<string, string | number | undefined | null>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text.length > 0 && text !== ALL_VALUE) {
      params.set(key, text);
    }
  }

  return params.toString();
}
