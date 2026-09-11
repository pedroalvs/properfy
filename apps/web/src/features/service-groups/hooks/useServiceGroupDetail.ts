import { useMemo } from 'react';
import type { paths, ServiceGroupStatus } from '@properfy/shared';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ServiceGroupDetail } from '../types';

/**
 * API-side detail payload, derived from the generated contract so a backend
 * rename of a mapped field breaks the build instead of silently yielding
 * `undefined`. Two areas are narrowed on top of the contract because the
 * OpenAPI registration under-specifies them (`appointments`/`assignedInspector`
 * typed as `unknown`, `assignedInspectorName` omitted) — a known gap, see
 * `audit-specs/service-groups.md` risk #8; fixing it is backend scope.
 */
type ServiceGroupDetailResponse =
  paths['/v1/service-groups/{groupId}']['get']['responses'][200]['content']['application/json']['data'];

interface RawGroupAppointment {
  id: string;
  appointmentNumber: number;
  status: string;
  scheduledDate?: string | null;
  timeSlotStart?: string | null;
  timeSlotEnd?: string | null;
  rentalTenantConfirmationStatus?: string | null;
  propertyAddress?: string | null;
  propertyCode?: string | null;
}

type RawServiceGroupDetail = Omit<ServiceGroupDetailResponse, 'appointments'> & {
  assignedInspectorName?: string | null;
  appointments?: RawGroupAppointment[];
};

export interface UseServiceGroupDetailReturn {
  serviceGroup: ServiceGroupDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceGroupDetail(id: string | null): UseServiceGroupDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<RawServiceGroupDetail>(
    ['service-groups', id],
    `/v1/service-groups/${id}`,
    { enabled: !!id },
  );

  const serviceGroup = useMemo<ServiceGroupDetail | null>(() => {
    const raw = response?.data ?? null;
    if (!raw) return null;
    return {
      ...raw,
      status: raw.status as ServiceGroupStatus,
      serviceRegionId: raw.serviceRegionId ?? null,
      regionName: raw.regionName ?? null,
      inspectorId: raw.assignedInspectorId ?? null,
      inspectorName: raw.assignedInspectorName ?? null,
      agencies: raw.agencies ?? [],
      appointmentsCount: raw.groupSize ?? (raw.appointments ?? []).length,
      scheduledDate: raw.scheduledDate ?? null,
      timeWindow: raw.timeWindow ?? null,
      updatedAt: raw.updatedAt ?? raw.createdAt,
      appointments: (raw.appointments ?? []).map((a) => ({
        id: a.id,
        appointmentNumber: a.appointmentNumber,
        status: a.status,
        scheduledDate: a.scheduledDate ?? null,
        timeSlotStart: a.timeSlotStart ?? null,
        timeSlotEnd: a.timeSlotEnd ?? null,
        rentalTenantConfirmationStatus: a.rentalTenantConfirmationStatus ?? null,
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
