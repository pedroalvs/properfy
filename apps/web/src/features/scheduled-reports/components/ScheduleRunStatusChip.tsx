import type { ScheduleRunStatus } from '../types';

const STYLES: Record<ScheduleRunStatus, { color: string; label: string }> = {
  queued: { color: 'bg-gray-200 text-gray-700', label: 'Queued' },
  running: { color: 'bg-[#B3E5FC] text-[#01579B]', label: 'Running' },
  completed: { color: 'bg-[#C8E6C9] text-[#1B5E20]', label: 'Completed' },
  failed: { color: 'bg-[#FFCDD2] text-[#B71C1C]', label: 'Failed' },
  skipped_catchup: { color: 'bg-[#F5F5F5] text-[#616161]', label: 'Skipped (catch-up)' },
  skipped_empty: { color: 'bg-[#F5F5F5] text-[#616161]', label: 'Skipped (empty)' },
};

/**
 * Feature 019 US4: visual chip for a ScheduledReportRun status.
 */
export function ScheduleRunStatusChip({ status }: { status: ScheduleRunStatus }) {
  const style = STYLES[status];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style.color}`}>
      {style.label}
    </span>
  );
}
