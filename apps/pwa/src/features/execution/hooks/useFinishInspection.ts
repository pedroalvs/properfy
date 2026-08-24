import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { getOrCreateIdempotencyKey } from '@/lib/idempotency';
import { useIsOnline } from '@/hooks/useIsOnline';
import { enqueueAction } from '../lib/indexeddb';
import type { CapturedLocation } from '../types';

interface FinishInput {
  appointmentId: string;
  location: CapturedLocation;
}

interface FinishResponse {
  appointmentId: string;
  status: string;
}

export function useFinishInspection() {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation<{ data: FinishResponse }, ApiError, FinishInput>({
    mutationFn: async ({ appointmentId, location }) => {
      const idempotencyKey = getOrCreateIdempotencyKey(`finish-${appointmentId}`);

      const body = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      if (!isOnline) {
        await enqueueAction({
          id: crypto.randomUUID(),
          type: 'FINISH',
          appointmentId,
          payload: body,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          lastError: null,
        });

        return {
          data: { appointmentId, status: 'QUEUED' },
        };
      }

      return apiPost<{ data: FinishResponse }>(
        `/v1/inspector/appointments/${appointmentId}/finish`,
        body,
        { 'Idempotency-Key': idempotencyKey },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'appointment'] });
    },
  });
}
