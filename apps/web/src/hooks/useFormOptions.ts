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

  const items = (response?.data ?? []).map(mapper);

  return { options: items, isLoading };
}
