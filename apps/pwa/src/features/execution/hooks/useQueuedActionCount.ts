import { useSyncExternalStore } from 'react';
import { subscribeQueue, getQueueSnapshot } from './useOfflineQueue';

/**
 * Number of queued offline actions, read from the shared offline-queue snapshot.
 * There is no independent poll: the snapshot is kept current by the queue runner
 * ({@link useOfflineQueue}) and by the enqueue paths, so the badge never lags.
 */
export function useQueuedActionCount(): number {
  return useSyncExternalStore(subscribeQueue, getQueueSnapshot).length;
}
