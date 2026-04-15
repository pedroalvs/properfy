import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { ScheduledReportRun } from '../types';

/**
 * Feature 019 US4: run history for a given schedule id.
 */
export function useScheduleRuns(scheduleId: string | null, page = 1, pageSize = 20) {
  return usePaginatedQuery<ScheduledReportRun>(
    ['scheduled-report-runs', scheduleId],
    scheduleId ? `/v1/reports/schedules/${scheduleId}/runs` : '/noop',
    { page, pageSize },
    { enabled: !!scheduleId },
  );
}
