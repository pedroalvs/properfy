import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
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
      const { data, error } = await api.POST(`/v1/marketplace/offers/${groupId}/accept` as any, {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      });
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Failed to accept offer');
      }
      return data;
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
