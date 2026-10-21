import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKeyManager } from '@properfy/shared';
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
  // Stable key per in-flight adjustment, rotated only on success (HOL-3a) — a
  // re-submit after a lost response dedupes instead of creating a second entry.
  const idempotencyKey = useRef(createIdempotencyKeyManager());

  return useMutation({
    mutationFn: async (data: CreateAdjustmentInput) => {
      const { data: responseData, error, response } = await api.POST('/v1/financial/entries/adjust' as any, {
        body: data as any,
        headers: {
          'Idempotency-Key': idempotencyKey.current.current(),
        },
      });
      if (error) throw toApiError(error, response?.status);
      return responseData;
    },
    onSuccess: () => {
      idempotencyKey.current.rotate();
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries', 'summary'] });
    },
  });
}
