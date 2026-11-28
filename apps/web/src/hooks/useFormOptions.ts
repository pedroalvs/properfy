import { useMemo } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { SelectOption } from '@/components/forms/SelectInput';

export function useFormOptions<T>(
  queryKey: unknown[],
  path: string,
  mapper: (item: T) => SelectOption,
  extraParams?: Partial<ListParams>,
  options?: { enabled?: boolean; staleTime?: number },
): { options: SelectOption[]; isLoading: boolean; items: T[] } {
  const { data: response, isLoading } = usePaginatedQuery<T>(
    queryKey,
    path,
    { pageSize: 100, ...extraParams },
    options,
  );

  // Raw fetched rows, memoized for referential stability (web CLAUDE.md §13.11).
  // Exposed alongside `options` so a caller that needs more than `{value,label}`
  // (e.g. resolving the selected row's address) can read it from the SAME query
  // — no duplicate network request, no second query key to keep in sync.
  const items = useMemo(() => response?.data ?? [], [response?.data]);

  // PR #961 bug class: memoized so consumers get a stable options array per
  // fetch result. `mapper` is intentionally NOT a dependency — callers pass it
  // inline (fresh reference every render), so depending on it would defeat the
  // memo. Mappers must be pure projections of the item.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapped = useMemo(() => items.map(mapper), [items]);

  return { options: mapped, isLoading, items };
}
