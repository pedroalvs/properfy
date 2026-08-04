import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

interface UpdateMyTimezoneInput {
  /** IANA identifier, e.g. 'Australia/Sydney'. */
  timezone: string;
}

/**
 * PATCH /v1/me — updates the inspector's personal timezone.
 * The generated api-types do not carry this route yet, hence the cast
 * (same pattern as useUpdateInspectorSelf).
 */
export function useUpdateMyTimezone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMyTimezoneInput) => {
      const { error } = await api.PATCH('/v1/me' as never, { body: input } as never);
      if (error) {
        const msg = (error as { error?: { message?: string } })?.error?.message;
        throw new Error(msg ?? 'Failed to update timezone');
      }
    },
    onSuccess: () => {
      // Every schedule/offer surface derives "today" from the effective
      // timezone, so refetch everything rather than chase individual keys.
      queryClient.invalidateQueries();
    },
  });
}
