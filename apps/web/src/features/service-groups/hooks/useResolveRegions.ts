import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { getErrorMessage } from '@/lib/api-error';

export interface ResolvedRegionItem {
  regionId: string;
  /**
   * Sequential region code. Also the server's tie-break when several overlapping
   * regions match the same appointments (lowest wins), so the order this list
   * arrives in is meaningful rather than incidental.
   */
  regionNumber: number;
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
      const body: { appointmentIds: string[]; tenantId?: string } = { appointmentIds };
      if (tenantId) body.tenantId = tenantId;
      // Route registers no typed request body in the spec.
      const { data, error } = await api.POST('/v1/service-regions/resolve', { body: body as never });
      if (error) throw new Error(getErrorMessage(error, 'Failed to resolve regions'));
      return ((data as unknown as { data?: ResolveRegionsResult })?.data ?? data) as ResolveRegionsResult;
    },
    enabled: appointmentIds.length > 0,
  });
}
