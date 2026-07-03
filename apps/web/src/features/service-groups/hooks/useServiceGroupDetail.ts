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
      serviceRegionId: raw.serviceRegionId ?? null,
      regionName: raw.regionName ?? null,
      inspectorId: raw.assignedInspectorId ?? null,
      inspectorName: raw.assignedInspectorName ?? null,
      agencies: raw.agencies ?? [],
      appointmentsCount: raw.groupSize ?? (raw.appointments ?? []).length,
      updatedAt: raw.updatedAt ?? raw.createdAt,
      appointments: (raw.appointments ?? []).map((a: any) => ({
        id: a.id,
        appointmentNumber: a.appointmentNumber,
        status: a.status,
        scheduledDate: a.scheduledDate ?? null,
        propertyAddress: a.propertyAddress ?? null,
        propertyCode: a.propertyCode ?? null,
      })),
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
