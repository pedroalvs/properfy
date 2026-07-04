import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { AvailabilityTemplate, InspectorAvailabilityResponse } from '@properfy/shared';

/** PUT /v1/inspectors/me/availability-template with optimistic update. */
export function useUpdateInspectorAvailabilityTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const QUERY_KEY = ['inspector', 'availability-template', user?.id];

  return useMutation({
    mutationFn: async (template: AvailabilityTemplate) => {
      const { data, error } = await api.PUT(
        '/v1/inspectors/me/availability-template' as never,
        { body: { template } } as never,
      );
      if (error) {
        const msg = (error as { error?: { message?: string } })?.error?.message;
        throw new Error(msg ?? 'Failed to update availability');
      }
      return data as InspectorAvailabilityResponse;
    },
    onMutate: async (template) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshot = queryClient.getQueryData<InspectorAvailabilityResponse>(QUERY_KEY);
      queryClient.setQueryData<InspectorAvailabilityResponse | undefined>(QUERY_KEY, (prev) =>
        prev ? { ...prev, template } : prev,
      );
      return { snapshot };
    },
    onError: (_err, _template, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(QUERY_KEY, context.snapshot);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}
