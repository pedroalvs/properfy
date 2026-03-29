import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ServiceGroupDetail } from '../types';

export interface UseServiceGroupDetailReturn {
  serviceGroup: ServiceGroupDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceGroupDetail(id: string | null): UseServiceGroupDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ServiceGroupDetail>(
    ['service-groups', id],
    `/v1/service-groups/${id}`,
    { enabled: !!id },
  );

  const serviceGroup = useMemo<ServiceGroupDetail | null>(() => {
    const raw: any = response?.data ?? null;
    if (!raw) return null;
    return {
      ...raw,
      name: raw.name ?? '',
      regionName: raw.regionName ?? null,
      inspectorId: raw.assignedInspectorId ?? null,
      inspectorName: raw.assignedInspectorName ?? null,
      appointmentsCount: raw.groupSize ?? 0,
      updatedAt: raw.updatedAt ?? raw.createdAt,
      appointmentCodes: (raw.appointments ?? []).map((a: any) => a.id),
      description: raw.description ?? null,
    };
  }, [response?.data]);

  return {
    serviceGroup,
    isLoading,
    isError,
    refetch,
  };
}
