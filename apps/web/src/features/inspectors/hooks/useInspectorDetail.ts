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
    const regionIds = Array.isArray(raw.regionIds) ? raw.regionIds : [];
    return {
      ...raw,
      regionIds,
      serviceTypes: Array.isArray(raw.serviceTypesJson) ? raw.serviceTypesJson : [],
      regionsCount: regionIds.length,
      serviceTypesCount: Array.isArray(raw.serviceTypesJson) ? raw.serviceTypesJson.length : 0,
      fullName: raw.fullName ?? null,
      abn: raw.abn ?? null,
      dateOfBirth: raw.dateOfBirth ?? null,
      insuranceFileKey: raw.insuranceFileKey ?? null,
      insuranceExpiresAt: raw.insuranceExpiresAt ?? null,
      policeCheckFileKey: raw.policeCheckFileKey ?? null,
      policeCheckExpiresAt: raw.policeCheckExpiresAt ?? null,
      blockedClients: Array.isArray(raw.blockedClients) ? raw.blockedClients : [],
    };
  }, [raw]);

  return {
    inspector,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
