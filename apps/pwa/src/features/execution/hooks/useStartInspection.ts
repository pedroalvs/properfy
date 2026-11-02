import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StartInspectionResponse } from '@properfy/shared';
import { apiPost } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { getOrCreateIdempotencyKey } from '@/lib/idempotency';
import { useIsOnline } from '@/hooks/useIsOnline';
import { enqueueAction } from '../lib/indexeddb';
import { refreshQueueSnapshot } from './useOfflineQueue';
import type { CapturedLocation } from '../types';

interface StartInput {
  appointmentId: string;
  location: CapturedLocation;
}

export function useStartInspection() {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation<{ data: StartInspectionResponse }, ApiError, StartInput>({
    mutationFn: async ({ appointmentId, location }) => {
      const idempotencyKey = getOrCreateIdempotencyKey(`start-${appointmentId}`);

      // F03: send device accuracy and the capture instant so the server can
      // evaluate the geofence and record out-of-window on a late offline sync.
      const body = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        clientOccurredAt: location.capturedAt,
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
        // Reflect the new queued action in the shared snapshot so the badge count
        // updates immediately (there is no longer a poll to pick it up).
        await refreshQueueSnapshot();

        return {
          data: {
            executionId: '',
            appointmentId,
            startedAt: location.capturedAt,
            startLatitude: location.latitude,
            startLongitude: location.longitude,
            geolocationDistanceMeters: null,
            status: 'IN_PROGRESS',
          },
        };
      }

      return apiPost<{ data: StartInspectionResponse }>(
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
