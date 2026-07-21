import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

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
      const { data: responseData, error, response } = await api.POST('/v1/financial/entries/adjust' as any, {
        body: data as any,
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      if (error) throw toApiError(error, response?.status);
      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries', 'summary'] });
    },
  });
}
