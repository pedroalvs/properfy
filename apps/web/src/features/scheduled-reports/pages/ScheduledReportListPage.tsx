import { useState, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useScheduledReportList } from '../hooks/useScheduledReportList';
import { ScheduledReportTable } from '../components/ScheduledReportTable';
import { ScheduledReportFormDrawer } from '../components/ScheduledReportFormDrawer';
import { ScheduleRunHistoryDrawer } from '../components/ScheduleRunHistoryDrawer';
import type { ScheduledReport } from '../types';

/**
 * Feature 019 US4: schedule management dashboard (AM / OP / CL_ADMIN / CL_USER).
 *
 * Wires together:
 *  - ScheduledReportTable (list + row actions)
 *  - ScheduledReportFormDrawer (create / edit)
 *  - ScheduleRunHistoryDrawer (run history per schedule)
 */
export function ScheduledReportListPage() {
  const { hasRole } = usePermissions();
  const { data, isLoading, isError, error, refetch } = useScheduledReportList();

  const [formOpen, setFormOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduledReport | null>(null);

  const [runsOpen, setRunsOpen] = useState(false);
  const [runsSchedule, setRunsSchedule] = useState<ScheduledReport | null>(null);

  const handleEdit = useCallback((schedule: ScheduledReport) => {
    setEditSchedule(schedule);
    setFormOpen(true);
  }, []);

  const handleViewRuns = useCallback((schedule: ScheduledReport) => {
    setRunsSchedule(schedule);
    setRunsOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditSchedule(null);
  }, []);

  const handleSaved = useCallback(() => {
    setFormOpen(false);
    setEditSchedule(null);
    refetch();
  }, [refetch]);

  const handleMutated = useCallback(() => {
    refetch();
  }, [refetch]);

  if (!hasRole('AM', 'OP', 'CL_ADMIN', 'CL_USER')) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          You do not have permission to view this page.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-secondary">Report Schedules</h1>
          <button
            onClick={() => {
              setEditSchedule(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded bg-[#F37A76] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F37A76]/90"
          >
            <i className="mdi mdi-plus text-base" aria-hidden="true" />
            New Schedule
          </button>
        </div>
        <p className="mb-6 text-sm text-text-secondary">
          Recurring reports automatically generated and delivered to system users who have access.
        </p>

        {isLoading && <div className="text-sm text-text-secondary">Loading schedules…</div>}
        {isError && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Failed to load schedules: {error?.message ?? 'Unknown error'}
          </div>
        )}
        {data && (
          <ScheduledReportTable
            data={data.data}
            onEdit={handleEdit}
            onViewRuns={handleViewRuns}
            onMutated={handleMutated}
          />
        )}
      </div>

      <ScheduledReportFormDrawer
        open={formOpen}
        onClose={handleFormClose}
        schedule={editSchedule}
        onSaved={handleSaved}
      />

      <ScheduleRunHistoryDrawer
        open={runsOpen}
        onClose={() => setRunsOpen(false)}
        scheduleId={runsSchedule?.id ?? null}
        scheduleName={runsSchedule?.displayName}
      />
    </>
  );
}
