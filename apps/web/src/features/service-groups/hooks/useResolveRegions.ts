import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface ResolvedRegionItem {
  regionId: string;
  regionName: string;
  color: string;
  matchedAppointmentCount: number;
  inspectorCount: number;
}

export interface ResolveRegionsResult {
  regions: ResolvedRegionItem[];
  totalAppointments: number;
  unmatchedAppointmentIds: string[];
}

export function useResolveRegions(appointmentIds: string[], tenantId?: string) {
  return useQuery({
    queryKey: ['service-regions', 'resolve', appointmentIds, tenantId],
    queryFn: async () => {
      const body: Record<string, unknown> = { appointmentIds };
      if (tenantId) body.tenantId = tenantId;
      const { data, error } = await api.POST('/v1/service-regions/resolve' as any, {
        body: body as any,
      });
      if (error) throw new Error((error as any)?.error?.message ?? 'Failed to resolve regions');
      return ((data as any)?.data ?? data) as ResolveRegionsResult;
    },
    enabled: appointmentIds.length > 0,
  });
}
