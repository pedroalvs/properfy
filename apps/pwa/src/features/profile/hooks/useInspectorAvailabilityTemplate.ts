import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import type { InspectorAvailabilityResponse } from '@properfy/shared';

export function useInspectorAvailabilityTemplate() {
  return useQuery<{ data: InspectorAvailabilityResponse }, Error, InspectorAvailabilityResponse>({
    queryKey: ['inspector', 'availability-template'],
    queryFn: () => apiGet<{ data: InspectorAvailabilityResponse }>('/v1/inspectors/me/availability-template'),
    select: (response) => response.data,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  });
}
