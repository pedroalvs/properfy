import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ScheduleRunStatusChip } from './ScheduleRunStatusChip';
import { useScheduleRuns } from '../hooks/useScheduleRuns';

interface ScheduleRunHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  scheduleId: string | null;
  scheduleName?: string | null;
}

/**
 * Feature 019 T092: drawer showing paginated run history for a schedule.
 * Uses the existing useScheduleRuns hook.
 */
export function ScheduleRunHistoryDrawer({
  open,
  onClose,
  scheduleId,
  scheduleName,
}: ScheduleRunHistoryDrawerProps) {
  const { data, isLoading, isError, error } = useScheduleRuns(
    open ? scheduleId : null,
  );

  const runs = data?.data ?? [];

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        <DrawerHeader
          title={scheduleName ? `Run history — ${scheduleName}` : 'Run history'}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && <LoadingState rows={5} />}

          {isError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Failed to load run history: {error?.message ?? 'Unknown error'}
            </div>
          )}

          {!isLoading && !isError && runs.length === 0 && (
            <EmptyState
              icon="mdi-history"
              title="No runs yet"
              description="This schedule has not executed any runs yet."
            />
          )}

          {!isLoading && !isError && runs.length > 0 && (
            <div className="flex flex-col gap-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded border border-gray-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-text-secondary">
                      {new Date(run.scheduledFor).toLocaleString()}
                    </span>
                    <ScheduleRunStatusChip status={run.status} />
                  </div>

                  {run.startedAt && (
                    <div className="text-xs text-text-muted">
                      Started:{' '}
                      {new Date(run.startedAt).toLocaleString()}
                    </div>
                  )}

                  {run.completedAt && (
                    <div className="text-xs text-text-muted">
                      Completed:{' '}
                      {new Date(run.completedAt).toLocaleString()}
                    </div>
                  )}

                  {run.recipientCount != null && (
                    <div className="text-xs text-text-muted">
                      Recipients: {run.recipientCount}
                    </div>
                  )}

                  {run.errorMessage && (
                    <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                      {run.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DrawerPanel>
  );
}
