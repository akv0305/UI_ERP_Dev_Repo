'use client';

import type { SortingState } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FilterBarValue } from '@/components/erp';
import { ALL_VALUE, buildQueryString } from '@/lib/list-params';

const SEARCH_DEBOUNCE_MS = 400;

export interface MasterListQuery {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export interface UseMasterListOptions {
  basePath: string;
  query: MasterListQuery;
  /** Filter values as they currently are in the URL; keys equal the API query parameter names. */
  initialFilters: FilterBarValue;
  /** Table column id -> API sortBy value; columns not listed are not sortable. */
  sortable: Record<string, string>;
  defaultSortBy: string;
}

/** Keeps list state in the URL: the server page re-fetches whenever it changes. */
export function useMasterList({
  basePath,
  query,
  initialFilters,
  sortable,
  defaultSortBy,
}: UseMasterListOptions) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterBarValue>(initialFilters);

  function navigate(next: Partial<MasterListQuery>, values: FilterBarValue = filters): void {
    const merged = { ...query, ...next };

    router.push(`${basePath}?${buildQueryString({ ...merged, ...values })}`);
  }

  // Debounce typing in the search box; every other filter navigates immediately.
  useEffect(() => {
    if ((filters.search ?? '').trim() === (initialFilters.search ?? '')) {
      return;
    }

    const timer = setTimeout(() => navigate({ page: 1 }), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filters.search]);

  const sorting: SortingState = [{ id: query.sortBy, desc: query.sortDir === 'desc' }];

  function handleSortingChange(next: SortingState): void {
    const first = next[0];
    const sortBy = first === undefined ? undefined : sortable[first.id];

    if (first === undefined || sortBy === undefined) {
      navigate({ sortBy: defaultSortBy, sortDir: 'asc', page: 1 });
      return;
    }

    navigate({ sortBy, sortDir: first.desc ? 'desc' : 'asc', page: 1 });
  }

  function handleFilterChange(next: FilterBarValue): void {
    const changedOther = Object.keys(next).some(
      (key) => key !== 'search' && next[key] !== filters[key],
    );

    setFilters(next);

    if (changedOther) {
      navigate({ page: 1 }, next);
    }
  }

  function handleReset(): void {
    const cleared: FilterBarValue = {};

    for (const key of Object.keys(filters)) {
      cleared[key] = key === 'search' ? '' : ALL_VALUE;
    }

    setFilters(cleared);
    navigate({ page: 1 }, cleared);
  }

  return {
    router,
    filters,
    sorting,
    navigate,
    handleSortingChange,
    handleFilterChange,
    handleReset,
  };
}
