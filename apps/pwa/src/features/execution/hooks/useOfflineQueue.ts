import { useEffect, useCallback } from 'react';
import { useIsOnline } from '@/hooks/useIsOnline';
import { getAllQueuedActions, removeQueuedAction, updateQueuedAction } from '../lib/indexeddb';
import { apiPost } from '@/hooks/useApiQuery';
import { clearExecutionState } from '../lib/indexeddb';

const MAX_RETRIES = 3;

export function useOfflineQueue() {
  const isOnline = useIsOnline();

  const processQueue = useCallback(async () => {
    const actions = (await getAllQueuedActions()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );

    const actionsByAppointment = new Map<string, typeof actions>();
    for (const action of actions) {
      const group = actionsByAppointment.get(action.appointmentId) ?? [];
      group.push(action);
      actionsByAppointment.set(action.appointmentId, group);
    }

    await Promise.allSettled(
      Array.from(actionsByAppointment.values()).map(async (group) => {
        for (const action of group) {
          if (action.retryCount > MAX_RETRIES) {
            console.warn(`[OfflineQueue] Action ${action.id} exceeded max retries (${MAX_RETRIES}), skipping. Last error: ${action.lastError}`);
            continue;
          }

          try {
            const path =
              action.type === 'START'
                ? `/v1/inspector/appointments/${action.appointmentId}/start`
                : `/v1/inspector/appointments/${action.appointmentId}/finish`;

            await apiPost(path, action.payload, {
              'Idempotency-Key': action.idempotencyKey,
            });

            await removeQueuedAction(action.id);
            if (action.type === 'FINISH') {
              await clearExecutionState(action.appointmentId);
            }
          } catch (err) {
            const lastError = err instanceof Error ? err.message : 'Unknown error';
            await updateQueuedAction({
              ...action,
              retryCount: (action.retryCount ?? 0) + 1,
              lastError,
            });
            break;
          }
        }
      }),
    );
  }, []);

  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  return { processQueue };
}
