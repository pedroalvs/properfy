import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export interface CreateRefundInput {
  appointmentId: string;
  amount: number;
  reason: string;
  effectiveAt: string;
}

export function useCreateRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRefundInput) => {
      const { data: response, error } = await api.POST('/v1/financial/entries' as any, {
        body: data as any,
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Failed to create refund');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries', 'summary'] });
    },
  });
}
