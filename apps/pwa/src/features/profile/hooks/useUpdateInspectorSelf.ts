import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

interface UpdateInspectorSelfInput {
  phone?: string | null;
}

/** PATCH /v1/inspectors/me — updates editable inspector fields (phone). */
export function useUpdateInspectorSelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateInspectorSelfInput) => {
      const { error } = await api.PATCH('/v1/inspectors/me', { body: input });
      if (error) {
        const msg =
          error && typeof error === 'object' && 'error' in error
            ? (error as { error?: { message?: string } }).error?.message
            : undefined;
        throw new Error(msg ?? 'Failed to update profile');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector'] });
    },
  });
}
