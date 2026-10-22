import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKeyManager } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

export interface CreateRefundInput {
  entryId: string;
  description: string;
  reason: string;
}

export function useCreateRefund() {
  const queryClient = useQueryClient();
  // One key per in-flight refund: a retry after a lost response reuses it so the
  // backend dedupes, and it is rotated only once the refund actually lands
  // (HOL-3a). Minting a fresh key per call — the previous behaviour — would let a
  // re-submit double-refund.
  const idempotencyKey = useRef(createIdempotencyKeyManager());

  return useMutation({
    mutationFn: async (data: CreateRefundInput) => {
      const { entryId, ...body } = data;
      const { data: responseData, error, response } = await api.POST('/v1/financial/entries/{entryId}/refund', {
        params: { path: { entryId } },
        body,
        headers: {
          'Idempotency-Key': idempotencyKey.current.current(),
        },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return responseData;
    },
    onSuccess: () => {
      idempotencyKey.current.rotate();
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-entries', 'summary'] });
    },
  });
}
