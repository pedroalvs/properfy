import { useDetailQuery } from '@/hooks/useApiQuery';
import type { InspectorDetail } from '../types';

export interface UseInspectorDetailReturn {
  inspector: InspectorDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useInspectorDetail(id: string | null): UseInspectorDetailReturn {
  const query = useDetailQuery<InspectorDetail>(
    ['inspectors', id],
    `/v1/inspectors/${id}`,
    { enabled: !!id },
  );

  return {
    inspector: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
