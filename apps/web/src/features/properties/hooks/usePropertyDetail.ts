import { useDetailQuery } from '@/hooks/useApiQuery';
import type { PropertyDetail } from '../types';

export interface UsePropertyDetailReturn {
  property: PropertyDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function usePropertyDetail(id: string | null): UsePropertyDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<PropertyDetail>(
    ['properties', id],
    `/v1/properties/${id}`,
    { enabled: !!id },
  );

  return {
    property: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
