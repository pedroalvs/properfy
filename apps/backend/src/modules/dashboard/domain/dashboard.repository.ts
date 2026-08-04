import type { DashboardStatsOutput } from '../application/use-cases/get-dashboard-stats.use-case';

export interface DashboardRepository {
  getStats(
    tenantId?: string,
    includeInspectorBreakdowns?: boolean,
    now?: Date,
    timezone?: string,
  ): Promise<DashboardStatsOutput>;
}
