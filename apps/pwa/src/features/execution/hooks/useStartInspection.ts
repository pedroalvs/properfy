import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/hooks/useApiQuery';
import { ApiError } from '@/lib/api-error';
import { getOrCreateIdempotencyKey } from '@/lib/idempotency';
import { useIsOnline } from '@/hooks/useIsOnline';
import { enqueueAction } from '../lib/indexeddb';
import type { CapturedLocation } from '../types';

interface StartInput {
  appointmentId: string;
  location: CapturedLocation;
}

interface StartResponse {
  appointmentId: string;
  status: string;
  startedAt: string;
  checklistTemplate: unknown[];
}

export function useStartInspection() {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation<{ data: StartResponse }, ApiError, StartInput>({
    mutationFn: async ({ appointmentId, location }) => {
      const idempotencyKey = getOrCreateIdempotencyKey(`start-${appointmentId}`);

      const body = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      if (!isOnline) {
        await enqueueAction({
          id: crypto.randomUUID(),
          type: 'START',
          appointmentId,
          payload: body,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          lastError: null,
        });

        return {
          data: {
            appointmentId,
            status: 'SCHEDULED',
            startedAt: location.capturedAt,
            checklistTemplate: [],
          },
        };
      }

      return apiPost<{ data: StartResponse }>(
        `/v1/inspector/appointments/${appointmentId}/start`,
        body,
        { 'Idempotency-Key': idempotencyKey },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
    },
  });
}
