import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';

export interface PurgeDayPlanRouteDataResult {
  purged: number;
}

/**
 * Daily purge (FR-016, L-F04-03 Plan-A retention). Nulls `route_geometry`,
 * `routing_matrix_json` and `leg_travel_json` of every plan whose `plan_date` is
 * before today (platform timezone), stamping `geometry_purged_at`. Rows are kept
 * otherwise — the ETA-accuracy metric reads the frozen `published_*` columns. Log
 * only, no audit (FR-019). Idempotent: a second same-day run touches 0 rows.
 */
export class PurgeDayPlanRouteDataUseCase {
  constructor(
    private readonly repo: Pick<IDayPlanRepository, 'purgePastRouteData'>,
    private readonly logger: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(): Promise<PurgeDayPlanRouteDataResult> {
    const before = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    const purged = await this.repo.purgePastRouteData(before);
    this.logger.info({ purged, before }, 'day_plan.purge_route_data');
    return { purged };
  }
}
