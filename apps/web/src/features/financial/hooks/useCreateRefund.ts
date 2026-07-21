import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

export interface CreateRefundInput {
  entryId: string;
  description: string;
  reason: string;
}

export function useCreateRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRefundInput) => {
      const { entryId, ...body } = data;
      const { data: responseData, error, response } = await api.POST(`/v1/financial/entries/${entryId}/refund` as any, {
        body: body as any,
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
