import { useOfflineQueue } from '../hooks/useOfflineQueue';

/**
 * Surfaces offline-queue actions that exhausted their retries so the
 * inspector can retry them manually instead of losing the sync silently.
 */
export function FailedSyncBanner() {
  const { failedActions, retryAction } = useOfflineQueue();

  if (failedActions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="failed-sync-banner">
      {failedActions.map((action) => (
        <div
          key={action.id}
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-error/10 px-4 py-2 text-xs font-medium text-error"
        >
          <span>
            <i className="mdi mdi-sync-alert mr-1" aria-hidden="true" />
            A queued inspection sync failed: {action.lastError ?? 'Unknown error'}
          </span>
          <button
            type="button"
            onClick={() => retryAction(action.id)}
            className="shrink-0 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ))}
    </div>
  );
}
