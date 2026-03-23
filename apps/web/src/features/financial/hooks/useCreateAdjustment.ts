import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export interface CreateAdjustmentInput {
  tenantId: string;
  amount: number;
  effectiveAt: string;
  description: string;
  reason: string;
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAdjustmentInput) => {
      const { data: response, error } = await api.POST('/v1/financial/entries/adjust' as any, {
        body: data as any,
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Failed to create adjustment');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries', 'summary'] });
    },
  });
}
