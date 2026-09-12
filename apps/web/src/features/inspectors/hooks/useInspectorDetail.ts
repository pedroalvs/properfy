import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { InspectorStatus, ServiceTypeEntry, paths } from '@properfy/shared';
import type { InspectorDetail } from '../types';

type InspectorApiRecord =
  paths['/v1/inspectors/{inspectorId}']['get']['responses']['200']['content']['application/json']['data'];

export interface UseInspectorDetailReturn {
  inspector: InspectorDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useInspectorDetail(id: string | null): UseInspectorDetailReturn {
  const query = useDetailQuery<InspectorApiRecord>(
    ['inspectors', id],
    `/v1/inspectors/${id}`,
    { enabled: !!id },
  );

  const raw = query.data?.data ?? null;
  const inspector = useMemo<InspectorDetail | null>(() => {
    if (!raw) return null;
    const regionIds = raw.regionIds ?? [];
    const serviceTypes = Array.isArray(raw.serviceTypesJson)
      ? (raw.serviceTypesJson as ServiceTypeEntry[])
      : [];
    return {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      phone: raw.phone,
      status: raw.status as InspectorStatus,
      regionsCount: regionIds.length,
      serviceTypesCount: serviceTypes.length,
      // null, not 0, for an unrated inspector — see Inspector.ratingAvg.
      ratingAvg: raw.rating?.average ?? null,
      ratingCount: raw.rating?.responseCount ?? 0,
      completedCount: raw.rating?.doneServicesCount ?? 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      regionIds,
      serviceTypes,
      fullName: raw.fullName ?? null,
      abn: raw.abn ?? null,
      dateOfBirth: raw.dateOfBirth ?? null,
      insuranceFileKey: raw.insuranceFileKey ?? null,
      insuranceExpiresAt: raw.insuranceExpiresAt ?? null,
      policeCheckFileKey: raw.policeCheckFileKey ?? null,
      policeCheckExpiresAt: raw.policeCheckExpiresAt ?? null,
      blockedClients: raw.blockedClients ?? [],
      insuranceMetaJson: raw.insuranceMetaJson as InspectorDetail['insuranceMetaJson'],
      policeCheckMetaJson: raw.policeCheckMetaJson as InspectorDetail['policeCheckMetaJson'],
    };
  }, [raw]);

  return {
    inspector,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
