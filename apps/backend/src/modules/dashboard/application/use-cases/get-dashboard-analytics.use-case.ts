import type { AnalyticsGranularity, AuthContext, DashboardAnalyticsQuery, DashboardAnalyticsResponse } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { DashboardAnalyticsRepository } from '../../domain/dashboard-analytics.repository';

/** Roles that may read analytics — the same four the dashboard stats endpoint serves. */
const ANALYTICS_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'];

/** Roles pinned to their own agency; the rest aggregate across every tenant. */
const AGENCY_SCOPED_ROLES = ['CL_ADMIN', 'CL_USER'];

/**
 * The tenant an actor's aggregation is confined to — `undefined` only for the
 * genuinely cross-tenant roles.
 *
 * Fails closed. `actor.tenantId ?? undefined` reads identically to "AM/OP, no
 * filter" one line downstream, so an agency actor arriving without a tenant
 * would silently receive platform-wide totals, revenue and suburb density. No
 * API path mints such a context today — `create-user` rejects an agency user
 * with no tenant — but that is an argument that decays, and the cost of the
 * guard is one branch.
 *
 * The query never contributes: an agency actor cannot widen its own scope.
 */
export function resolveAgencyScope(actor: AuthContext): string | undefined {
  if (!AGENCY_SCOPED_ROLES.includes(actor.role)) return undefined;
  if (!actor.tenantId) {
    throw new ForbiddenError('AUTH_FORBIDDEN', 'Agency actor has no tenant scope');
  }
  return actor.tenantId;
}

/**
 * Longest period, in days, that still gets one bucket per day. Past it the
 * evolution series would out-pace the pixels available for it, so buckets widen
 * to calendar weeks.
 */
export const WEEKLY_GRANULARITY_THRESHOLD_DAYS = 60;

export interface GetDashboardAnalyticsInput {
  actor: AuthContext;
  query: DashboardAnalyticsQuery;
}

/** Inclusive day count between two civil dates. */
function periodLengthInDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export class GetDashboardAnalyticsUseCase {
  constructor(private readonly repository: DashboardAnalyticsRepository) {}

  async execute(input: GetDashboardAnalyticsInput): Promise<DashboardAnalyticsResponse> {
    const { actor, query } = input;

    if (!ANALYTICS_ROLES.includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view analytics');
    }

    const tenantId = resolveAgencyScope(actor);

    // A CL_USER without the flag gets `revenue: null` rather than a 403: the
    // financial figure is one card on a screen that is otherwise theirs to read.
    const includeRevenue =
      actor.role !== 'CL_USER' || (actor.clUserPermissions ?? []).includes('view_financials');

    const granularity: AnalyticsGranularity =
      periodLengthInDays(query.startDate, query.endDate) > WEEKLY_GRANULARITY_THRESHOLD_DAYS ? 'week' : 'day';

    return this.repository.getAnalytics({
      startDate: query.startDate,
      endDate: query.endDate,
      granularity,
      includeRevenue,
      tenantId,
      timezone: actor.timezone,
    });
  }
}
