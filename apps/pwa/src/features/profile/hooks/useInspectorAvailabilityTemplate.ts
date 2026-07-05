import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import type { InspectorAvailabilityResponse } from '@properfy/shared';

export function useInspectorAvailabilityTemplate() {
  const { user } = useAuth();

  return useQuery<{ data: InspectorAvailabilityResponse }, Error, InspectorAvailabilityResponse>({
    queryKey: ['inspector', 'availability-template', user?.id],
    queryFn: () => apiGet<{ data: InspectorAvailabilityResponse }>('/v1/inspectors/me/availability-template'),
    select: (response) => response.data,
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
