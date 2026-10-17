import { useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
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

// Module-level store so every consumer (app shell sync, page banners, the TopBar
// badge count) shares ONE snapshot of the queued actions and only one queue run
// happens at a time. The snapshot holds the full queue; consumers derive what they
// need from it (the failed subset, the total count) so there is no second polling
// mechanism that can drift out of sync.
let queueSnapshot: QueuedAction[] = [];
const listeners = new Set<() => void>();
let currentRun: Promise<void> | null = null;
let rerunRequested = false;
// Bumped on logout. A queue run captures the generation it started under and bails
// (stops sending, skips the snapshot refresh) once it changes, so an in-flight run
// can't keep syncing the previous inspector's actions — or repopulate the badge —
// after a logout has wiped the queue on a shared device.
let queueGeneration = 0;

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQueueSnapshot(): QueuedAction[] {
  return queueSnapshot;
}

function setQueueSnapshot(actions: QueuedAction[]): void {
  queueSnapshot = actions;
  listeners.forEach((listener) => listener());
}

/** Re-read the full queue from IndexedDB into the shared snapshot. */
export async function refreshQueueSnapshot(): Promise<void> {
  try {
    setQueueSnapshot(await getAllQueuedActions());
  } catch {
    // IndexedDB may be unavailable; keep the current snapshot.
  }
}

/**
 * Drop the in-memory snapshot and invalidate any in-flight run (e.g. on logout,
 * so the badge doesn't leak a count and a running sync stops touching the queue).
 */
export function resetQueueSnapshot(): void {
  queueGeneration += 1;
  setQueueSnapshot([]);
}

export function useOfflineQueue() {
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();
  const queue = useSyncExternalStore(subscribeQueue, getQueueSnapshot);
  const failedActions = useMemo(
    () => queue.filter((action) => action.status === 'FAILED'),
    [queue],
  );

  const processQueue = useCallback(async () => {
    if (currentRun) {
      // A run is already in flight with a possibly stale snapshot — ask it to
      // do one more pass after it finishes so this trigger is not lost.
      rerunRequested = true;
      return currentRun;
    }
    // Tracks the generation this run is acting under. Re-read at the start of each
    // pass so a rerun triggered by a fresh login adopts the new generation instead
    // of staying stuck on the logged-out one.
    let runGeneration = queueGeneration;
    currentRun = (async () => {
      try {
        do {
          rerunRequested = false;
          runGeneration = queueGeneration;
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
                  // A logout happened mid-run: stop syncing the previous
                  // inspector's actions on this (now shared) device.
                  if (runGeneration !== queueGeneration) break;

                  // Stop the whole chain on a permanent failure: a FINISH must
                  // never be sent after its START permanently failed.
                  if (action.status === 'FAILED') break;

                  if (action.retryCount > MAX_RETRIES) {
                    // Exhausted before the status field existed — surface it now.
                    await updateQueuedAction({ ...action, status: 'FAILED' });
                    showError(
                      `A queued inspection sync failed: ${action.lastError ?? 'Unknown error'}`,
                    );
                    break;
                  }

                  try {
                    const path =
                      action.type === 'START'
                        ? `/v1/inspector/appointments/${action.appointmentId}/start`
                        : `/v1/inspector/appointments/${action.appointmentId}/finish`;

                    await apiPost(path, action.payload, {
                      'Idempotency-Key': action.idempotencyKey,
                    });

                    // A logout may have landed while the request was in flight —
                    // don't write back a now-wiped inspector's bookkeeping.
                    if (runGeneration !== queueGeneration) break;

                    await removeQueuedAction(action.id);
                    if (action.type === 'FINISH') {
                      await clearExecutionState(action.appointmentId);
                    }
                  } catch (err) {
                    // Same guard on the failure path: a post-logout 401/network
                    // error must not resurrect the action in IndexedDB.
                    if (runGeneration !== queueGeneration) break;

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
          }
        } while (rerunRequested);
      } finally {
        currentRun = null;
        // Don't repopulate a snapshot that a logout cleared out from under us.
        if (runGeneration === queueGeneration) await refreshQueueSnapshot();
      }
    })();
    return currentRun;
  }, [showError]);

  const retryAction = useCallback(
    async (id: string) => {
      try {
        const actions = await getAllQueuedActions();
        const action = actions.find((a) => a.id === id);
        if (!action) return;
        await updateQueuedAction({ ...action, retryCount: 0, lastError: null, status: 'PENDING' });
        await refreshQueueSnapshot();
        await processQueue();
      } catch {
        showError('Unable to retry this sync right now.');
      }
    },
    [processQueue, showError],
  );

  useEffect(() => {
    if (isOnline) {
      processQueue();
    } else {
      // Still surface previously failed syncs while offline.
      refreshQueueSnapshot();
    }
  }, [isOnline, processQueue]);

  return { processQueue, failedActions, retryAction };
}
