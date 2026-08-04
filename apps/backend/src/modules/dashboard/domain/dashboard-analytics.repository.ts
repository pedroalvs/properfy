import type {
  AnalyticsGranularity,
  AnalyticsHeatmapResponse,
  DashboardAnalyticsResponse,
} from '@properfy/shared';

/**
 * Scope and shape of one analytics aggregation run. `tenantId` is resolved from
 * the auth context by the use case and is `undefined` for the cross-tenant roles;
 * `granularity` and `includeRevenue` are decisions the use case has already made,
 * so the repository stays a pure reader.
 */
export interface AnalyticsQuery {
  startDate: string;
  endDate: string;
  granularity: AnalyticsGranularity;
  includeRevenue: boolean;
  tenantId?: string;
  /** Injectable clock — the absolute today/week/month KPIs depend on it. */
  now?: Date;
  /** Actor's effective IANA timezone anchoring civil-day windows; defaults to the platform timezone. */
  timezone?: string;
}

export interface HeatmapQuery {
  // No timezone here on purpose: the heatmap ranges only the `scheduled_date`
  // @db.Date column, whose civil-date window is timezone-independent.
  startDate: string;
  endDate: string;
  tenantId?: string;
}

export interface DashboardAnalyticsRepository {
  getAnalytics(query: AnalyticsQuery): Promise<DashboardAnalyticsResponse>;
  getHeatmap(query: HeatmapQuery): Promise<AnalyticsHeatmapResponse>;
}
