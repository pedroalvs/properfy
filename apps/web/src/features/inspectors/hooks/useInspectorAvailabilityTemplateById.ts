import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { InspectorAvailabilityResponse } from '@properfy/shared';

/** Fetches the availability template for a specific inspector (AM/OP only). */
export function useInspectorAvailabilityTemplateById(inspectorId: string | null) {
  return useQuery({
    queryKey: ['inspector-availability-template', inspectorId],
    queryFn: async (): Promise<InspectorAvailabilityResponse> => {
      const { data, error } = await api.GET(
        `/v1/inspectors/{inspectorId}/availability-template` as never,
        { params: { path: { inspectorId } } } as never,
      );
      if (error) throw new Error((error as { error?: { message?: string } })?.error?.message ?? 'Failed to fetch');
      return (data as { data: InspectorAvailabilityResponse }).data;
    },
    enabled: !!inspectorId,
    staleTime: 60_000,
  });
}
