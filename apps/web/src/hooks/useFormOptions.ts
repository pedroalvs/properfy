import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { SelectOption } from '@/components/forms/SelectInput';

export function useFormOptions<T>(
  queryKey: unknown[],
  path: string,
  mapper: (item: T) => SelectOption,
): { options: SelectOption[]; isLoading: boolean } {
  const { data: response, isLoading } = usePaginatedQuery<T>(
    queryKey,
    path,
    { pageSize: 100 },
  );

  const options = (response?.data ?? []).map(mapper);

  return { options, isLoading };
}
