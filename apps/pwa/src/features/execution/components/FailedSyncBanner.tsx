import { AlertCircle } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
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
        <Alert key={action.id} tone="destructive" className="items-center justify-between">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 text-[13px] font-medium">
            A queued inspection sync failed: {action.lastError ?? 'Unknown error'}
          </span>
          <Button
            variant="outlined"
            onClick={() => retryAction(action.id)}
            className="h-8 min-h-0 shrink-0 px-3 text-[13px]"
          >
            Retry
          </Button>
        </Alert>
      ))}
    </div>
  );
}
