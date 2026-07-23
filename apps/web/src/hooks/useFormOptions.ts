import { useMemo } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { SelectOption } from '@/components/forms/SelectInput';

export function useFormOptions<T>(
  queryKey: unknown[],
  path: string,
  mapper: (item: T) => SelectOption,
  extraParams?: Partial<ListParams>,
  options?: { enabled?: boolean; staleTime?: number },
): { options: SelectOption[]; isLoading: boolean } {
  const { data: response, isLoading } = usePaginatedQuery<T>(
    queryKey,
    path,
    { pageSize: 100, ...extraParams },
    options,
  );

  // PR #961 bug class: memoized so consumers get a stable options array per
  // fetch result. `mapper` is intentionally NOT a dependency — callers pass it
  // inline (fresh reference every render), so depending on it would defeat the
  // memo. Mappers must be pure projections of the item.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => (response?.data ?? []).map(mapper), [response?.data]);

  return { options: items, isLoading };
}
