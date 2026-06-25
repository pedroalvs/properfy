import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { ScheduledReport } from '../types';

/**
 * Feature 019 US4: paginated schedule list. RBAC is enforced server-side; the
 * hook just surfaces whatever the backend returns.
 */
export function useScheduledReportList(params?: ListParams) {
  return usePaginatedQuery<ScheduledReport>(
    ['scheduled-reports'],
    '/v1/reports/schedules',
    params ?? { page: 1, pageSize: 20 },
  );
}
