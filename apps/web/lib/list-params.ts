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

/**
 * The value of one list filter. On first arrival (no list parameters in the URL at all) the
 * current working context is the default; once the user has touched the list the URL carries
 * parameters, so a filter they cleared stays cleared instead of snapping back to the context.
 */
export function filterFromContext(
  raw: SearchParams,
  key: string,
  contextValue: string | null,
): string | undefined {
  if (Object.keys(raw).length > 0) {
    return firstValue(raw[key]) || undefined;
  }

  return contextValue ?? undefined;
}

/** Ensures the selected filter value is offered by the select, even if the usual source lacks it. */
export function withSelectedOption<T extends { value: string; label: string }>(
  options: T[],
  selected: string | undefined,
  selectedLabel: string | null,
): T[] {
  if (
    selected === undefined ||
    selectedLabel === null ||
    options.some((option) => option.value === selected)
  ) {
    return options;
  }

  return [{ value: selected, label: selectedLabel } as T, ...options];
}
