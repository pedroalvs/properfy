import { useMemo } from 'react';
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

  const raw: any = query.data?.data ?? null;
  const inspector = useMemo<InspectorDetail | null>(() => {
    if (!raw) return null;
    return {
      ...raw,
      regions: Array.isArray(raw.regionsJson) ? raw.regionsJson : [],
      serviceTypes: Array.isArray(raw.serviceTypesJson) ? raw.serviceTypesJson : [],
      regionsCount: Array.isArray(raw.regionsJson) ? raw.regionsJson.length : 0,
      serviceTypesCount: Array.isArray(raw.serviceTypesJson) ? raw.serviceTypesJson.length : 0,
      rating: raw.rating ?? null,
    };
  }, [raw]);

  return {
    inspector,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
