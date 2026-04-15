import { usePermissions } from '@/hooks/usePermissions';
import { useScheduledReportList } from '../hooks/useScheduledReportList';
import { ScheduledReportTable } from '../components/ScheduledReportTable';

/**
 * Feature 019 US4: schedule management dashboard (AM / OP / CL_ADMIN / CL_USER).
 *
 * This is the minimal viable surface — create/edit/pause/resume/delete flows are
 * backend-complete; the UI surfaces the list + last run status + inline actions.
 * Form drawer and run-history drawer are scaffolded as follow-up work.
 */
export function ScheduledReportListPage() {
  const { hasRole } = usePermissions();
  const { data, isLoading, isError, error } = useScheduledReportList();

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
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Report Schedules</h1>
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
      {data && <ScheduledReportTable data={data.data} />}
    </div>
  );
}
