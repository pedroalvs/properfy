import { useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIsOnline } from '@/hooks/useIsOnline';
import {
  getAllQueuedActions,
  removeQueuedAction,
  updateQueuedAction,
  clearExecutionState,
  type QueuedAction,
} from '../lib/indexeddb';
import { emitExecutionStateChange } from '../lib/execution-state-events';
import { apiPost } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

const MAX_RETRIES = 3;

/** Appended to the toast when a queued check-in is rejected for being out of radius. */
const GEOFENCE_RETRY_HINT = " Check in again when you're at the property.";

/**
 * A queued START that comes back with a definitive client error must not be
 * retried: the address, assignment or T-1 window won't change by trying again.
 * 4xx are permanent EXCEPT auth (401 — logout handles it), request-timeout (408)
 * and rate-limit (429), which are worth another attempt. 5xx and network errors
 * (status 0 / no status) stay transient. A 422 GEOFENCE_OUT_OF_RADIUS is covered
 * here, so it fails on the first response with no retry (L-F03-02 / D21).
 */
function isPermanentQueueError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status !== 'number') return false;
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

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
  const gen = queueGeneration;
  try {
    const actions = await getAllQueuedActions();
    // A logout during the read invalidated this result (the queue was wiped) —
    // don't repopulate the badge with the previous inspector's actions.
    if (gen !== queueGeneration) return;
    setQueueSnapshot(actions);
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
  const queryClient = useQueryClient();
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

                    // Permanent START failure (L-F03-02 / D21): the check-in will
                    // never succeed by retrying (out of radius, reassigned, T-1
                    // passed). Fail it on the first response, drop the chained
                    // FINISH so it is never sent, clear the local draft and tell
                    // every mounted card to revert to "Check in".
                    if (action.type === 'START' && isPermanentQueueError(err)) {
                      await updateQueuedAction({
                        ...action,
                        retryCount: (action.retryCount ?? 0) + 1,
                        lastError,
                        status: 'FAILED',
                        permanent: true,
                      });
                      for (const other of group) {
                        if (other.id !== action.id && other.type === 'FINISH') {
                          await removeQueuedAction(other.id);
                        }
                      }
                      await clearExecutionState(action.appointmentId);
                      emitExecutionStateChange(action.appointmentId);
                      queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
                      const isGeofence =
                        (err as { code?: string } | null)?.code === 'GEOFENCE_OUT_OF_RADIUS';
                      showError(
                        `A queued inspection sync failed: ${lastError}${isGeofence ? GEOFENCE_RETRY_HINT : ''}`,
                      );
                      break;
                    }

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
  }, [showError, queryClient]);

  const retryAction = useCallback(
    async (id: string) => {
      try {
        const actions = await getAllQueuedActions();
        const action = actions.find((a) => a.id === id);
        if (!action) return;
        // A permanent failure (geofence/assignment/T-1) can never succeed by
        // retrying, and re-running its cleanup would wipe a newer legitimate
        // check-in's local state — so it is terminal and not retryable.
        if (action.permanent) return;
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
