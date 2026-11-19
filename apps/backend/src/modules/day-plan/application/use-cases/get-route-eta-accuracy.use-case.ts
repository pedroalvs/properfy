import {
  addCivilDays,
  ROUTE_ETA_ACCURACY_MIN_SAMPLE,
  ROUTE_ETA_ACCURACY_OUTLIER_MINUTES,
  ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES,
  type RouteEtaAccuracy,
} from '@properfy/shared';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';

export interface GetRouteEtaAccuracyInput {
  /** Day span, already validated to 7..90 by `routeEtaAccuracyQuerySchema`. */
  days: number;
}

/**
 * "Route ETA accuracy" metric (FR-014, D9, L-F04-15). The mean absolute error, in
 * minutes, between each stop's **frozen published** service start and the actual
 * check-in, over a civil window of `days` ending today (platform timezone).
 *
 * The repository query owns the correctness guarantees (published-vs-latest,
 * approximate/abandoned/post-check-in exclusion, the SCHEDULED/DONE status join);
 * this use case only drops gross outliers and classifies the result. AM/OP-only
 * access is enforced at the route.
 */
export class GetRouteEtaAccuracyUseCase {
  constructor(
    private readonly repo: Pick<IDayPlanRepository, 'getEtaAccuracySamples'>,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ days }: GetRouteEtaAccuracyInput): Promise<RouteEtaAccuracy> {
    const to = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    // `days` is inclusive of today, so a 30-day window reaches back 29 days.
    const from = addCivilDays(to, -(days - 1));

    const samples = await this.repo.getEtaAccuracySamples(from, to);

    let excludedOutliers = 0;
    let total = 0;
    let sampleSize = 0;
    for (const { errorMinutes } of samples) {
      if (errorMinutes > ROUTE_ETA_ACCURACY_OUTLIER_MINUTES) {
        excludedOutliers += 1;
        continue;
      }
      total += errorMinutes;
      sampleSize += 1;
    }

    const meanAbsoluteErrorMinutes =
      sampleSize === 0 ? null : Math.round((total / sampleSize) * 10) / 10;

    let status: RouteEtaAccuracy['status'];
    if (sampleSize < ROUTE_ETA_ACCURACY_MIN_SAMPLE) {
      status = 'INSUFFICIENT_DATA';
    } else if ((meanAbsoluteErrorMinutes ?? 0) > ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES) {
      status = 'ABOVE_THRESHOLD';
    } else {
      status = 'OK';
    }

    return {
      from,
      to,
      days,
      sampleSize,
      excludedOutliers,
      meanAbsoluteErrorMinutes,
      thresholdMinutes: ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES,
      minSampleSize: ROUTE_ETA_ACCURACY_MIN_SAMPLE,
      status,
    };
  }
}
