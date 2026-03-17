import type { DashboardStatsOutput } from '../application/use-cases/get-dashboard-stats.use-case';

export interface DashboardRepository {
  getStats(tenantId?: string): Promise<DashboardStatsOutput>;
}
