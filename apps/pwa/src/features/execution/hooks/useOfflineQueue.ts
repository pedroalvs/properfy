import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { useIsOnline } from '@/hooks/useIsOnline';
import {
  getAllQueuedActions,
  removeQueuedAction,
  updateQueuedAction,
  clearExecutionState,
  type QueuedAction,
} from '../lib/indexeddb';
import { apiPost } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

const MAX_RETRIES = 3;

// Module-level store so every hook instance (app shell sync, page banners)
// shares the same failed-action list and only one queue run happens at a time.
let failedSnapshot: QueuedAction[] = [];
const listeners = new Set<() => void>();
let isProcessing = false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): QueuedAction[] {
  return failedSnapshot;
}

function setFailedSnapshot(actions: QueuedAction[]): void {
  failedSnapshot = actions;
  listeners.forEach((listener) => listener());
}

async function refreshFailedSnapshot(): Promise<void> {
  try {
    const all = await getAllQueuedActions();
    setFailedSnapshot(all.filter((action) => action.status === 'FAILED'));
  } catch {
    // IndexedDB may be unavailable; keep the current snapshot.
  }
}

export function useOfflineQueue() {
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();
  const failedActions = useSyncExternalStore(subscribe, getSnapshot);

  const processQueue = useCallback(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
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
            if (action.status === 'FAILED') continue;

            if (action.retryCount > MAX_RETRIES) {
              // Exhausted before the status field existed — surface it now.
              await updateQueuedAction({ ...action, status: 'FAILED' });
              showError(`A queued inspection sync failed: ${action.lastError ?? 'Unknown error'}`);
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
              const retryCount = (action.retryCount ?? 0) + 1;
              const exhausted = retryCount > MAX_RETRIES;
              await updateQueuedAction({
                ...action,
                retryCount,
                lastError,
                status: exhausted ? 'FAILED' : 'PENDING',
              });
              if (exhausted) {
                showError(`A queued inspection sync failed: ${lastError}`);
              }
              break;
            }
          }
        }),
      );
    } catch {
      // IndexedDB may be unavailable; try again on the next trigger.
    } finally {
      isProcessing = false;
      await refreshFailedSnapshot();
    }
  }, [showError]);

  const retryAction = useCallback(
    async (id: string) => {
      const actions = await getAllQueuedActions();
      const action = actions.find((a) => a.id === id);
      if (!action) return;
      await updateQueuedAction({ ...action, retryCount: 0, lastError: null, status: 'PENDING' });
      await refreshFailedSnapshot();
      await processQueue();
    },
    [processQueue],
  );

  useEffect(() => {
    if (isOnline) {
      processQueue();
    } else {
      // Still surface previously failed syncs while offline.
      refreshFailedSnapshot();
    }
  }, [isOnline, processQueue]);

  return { processQueue, failedActions, retryAction };
}
