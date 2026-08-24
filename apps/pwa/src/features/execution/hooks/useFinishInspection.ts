import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FinishInspectionResponse } from '@properfy/shared';
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

/**
 * The online path posts to the generated finish contract (whose body the caller
 * doesn't read) and the offline path enqueues the action. The only thing callers
 * care about is whether the finish was queued for later sync, so we model that
 * explicitly instead of pretending an offline sentinel is the server response.
 */
interface FinishResult {
  queued: boolean;
}

export function useFinishInspection() {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation<FinishResult, ApiError, FinishInput>({
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

        return { queued: true };
      }

      await apiPost<{ data: FinishInspectionResponse }>(
        `/v1/inspector/appointments/${appointmentId}/finish`,
        body,
        { 'Idempotency-Key': idempotencyKey },
      );

      return { queued: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'appointment'] });
    },
  });
}
