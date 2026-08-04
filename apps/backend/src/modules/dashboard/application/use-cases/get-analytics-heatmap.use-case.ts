import type { AnalyticsHeatmapResponse, AuthContext, DashboardAnalyticsQuery } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { DashboardAnalyticsRepository } from '../../domain/dashboard-analytics.repository';
import { resolveAgencyScope } from './get-dashboard-analytics.use-case';

const ANALYTICS_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'];

export interface GetAnalyticsHeatmapInput {
  actor: AuthContext;
  query: DashboardAnalyticsQuery;
}

/**
 * Suburb-level appointment density for the analytics map. Split from the main
 * analytics payload because its size follows the number of distinct suburbs the
 * period touches, and the map card loads it on its own.
 */
export class GetAnalyticsHeatmapUseCase {
  constructor(private readonly repository: DashboardAnalyticsRepository) {}

  async execute(input: GetAnalyticsHeatmapInput): Promise<AnalyticsHeatmapResponse> {
    const { actor, query } = input;

    if (!ANALYTICS_ROLES.includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view analytics');
    }

    // Same fail-closed rule as the summary endpoint: a suburb map is a
    // property footprint, and leaking it cross-agency is the same disclosure.
    const tenantId = resolveAgencyScope(actor);

    return this.repository.getHeatmap({
      startDate: query.startDate,
      endDate: query.endDate,
      tenantId,
      timezone: actor.timezone,
    });
  }
}
