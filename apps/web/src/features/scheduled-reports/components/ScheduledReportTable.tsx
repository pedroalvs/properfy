import type { ScheduledReport } from '../types';
import { ScheduleStatusChip } from './ScheduleStatusChip';
import { ScheduleRunStatusChip } from './ScheduleRunStatusChip';

interface ScheduledReportTableProps {
  data: ScheduledReport[];
  loading?: boolean;
  onViewRuns?: (schedule: ScheduledReport) => void;
  onPause?: (schedule: ScheduledReport) => void;
  onResume?: (schedule: ScheduledReport) => void;
  onDelete?: (schedule: ScheduledReport) => void;
}

function formatRecurrence(cronExpression: string): string {
  // Basic humanizer for the three structured cron forms the use case generates.
  const parts = cronExpression.trim().split(/\s+/);
  const minute = parts[0] ?? '0';
  const hour = parts[1] ?? '0';
  const dayOfMonth = parts[2] ?? '*';
  const dayOfWeek = parts[4] ?? '*';
  const h = `${hour}:${minute.padStart(2, '0')}`;
  if (dayOfMonth !== '*') {
    return `Monthly on day ${dayOfMonth} at ${h}`;
  }
  if (dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `Weekly on ${days[Number(dayOfWeek)] ?? dayOfWeek} at ${h}`;
  }
  return `Daily at ${h}`;
}

/**
 * Feature 019 US4: schedule list table.
 */
export function ScheduledReportTable({
  data,
  loading,
  onViewRuns,
  onPause,
  onResume,
  onDelete,
}: ScheduledReportTableProps) {
  if (loading) {
    return <div className="p-6 text-sm text-text-secondary">Loading schedules…</div>;
  }
  if (data.length === 0) {
    return <div className="p-6 text-center text-sm text-text-muted">No schedules yet.</div>;
  }

  return (
    <div className="rounded border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs font-bold text-text-secondary">
          <tr>
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Report</th>
            <th className="py-2 px-3">Recurrence</th>
            <th className="py-2 px-3">Delivery</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Next run</th>
            <th className="py-2 px-3">Last run</th>
            <th className="py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-gray-100">
              <td className="py-2 px-3">{row.displayName ?? '—'}</td>
              <td className="py-2 px-3">{row.reportType}</td>
              <td className="py-2 px-3 text-text-secondary">{formatRecurrence(row.cronExpression)}</td>
              <td className="py-2 px-3 text-text-secondary">{row.deliveryMode}</td>
              <td className="py-2 px-3">
                <ScheduleStatusChip status={row.status} />
              </td>
              <td className="py-2 px-3 text-text-secondary">
                {row.nextRunAt ? new Date(row.nextRunAt).toLocaleString() : '—'}
              </td>
              <td className="py-2 px-3">
                {row.lastRunStatus ? <ScheduleRunStatusChip status={row.lastRunStatus} /> : '—'}
              </td>
              <td className="py-2 px-3 text-xs">
                <button
                  onClick={() => onViewRuns?.(row)}
                  className="mr-2 text-primary underline hover:text-primary/80"
                >
                  Runs
                </button>
                {row.status === 'ACTIVE' ? (
                  <button
                    onClick={() => onPause?.(row)}
                    className="mr-2 text-primary underline hover:text-primary/80"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => onResume?.(row)}
                    className="mr-2 text-primary underline hover:text-primary/80"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => onDelete?.(row)}
                  className="text-red-600 underline hover:text-red-500"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
