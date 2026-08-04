import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

interface UpdateMyTimezoneInput {
  /** IANA identifier, e.g. 'Australia/Sydney'; null clears back to the platform default. */
  timezone: string | null;
}

/** PATCH /v1/me — updates (or clears) the inspector's personal timezone. */
export function useUpdateMyTimezone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMyTimezoneInput) => {
      const { error } = await api.PATCH('/v1/me', { body: input });
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
