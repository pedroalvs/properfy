import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseOfferAcceptReturn {
  accept: (groupId: string) => void;
  isAccepting: boolean;
}

export function useOfferAccept(onSuccess?: () => void): UseOfferAcceptReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation({
    mutationFn: async (groupId: string) => {
      const idempotencyKey = crypto.randomUUID();
      // Typed against the generated contract — the literal path + path params
      // replace the template-string `as any` that silenced the check entirely.
      const result = await api.POST('/v1/marketplace/offers/{groupId}/accept', {
        params: { path: { groupId } },
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      });
      // The contract declares only a 200, so `result.error` is typed `never`;
      // at runtime openapi-fetch still populates it (and a non-ok response) on
      // failure. Normalize with the real HTTP status. (`result.response` is
      // optional-chained so unit mocks that omit it still take the error path.)
      if (result.error || result.response?.ok === false) {
        throw toApiError(result.error, result.response?.status);
      }
      return result.data;
    },
    onSuccess: () => {
      showSuccess('Offer accepted');
      queryClient.invalidateQueries({ queryKey: ['marketplace-offers'] });
      onSuccess?.();
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to accept offer');
    },
  });

  return {
    accept: (groupId: string) => mutation.mutate(groupId),
    isAccepting: mutation.isPending,
  };
}
