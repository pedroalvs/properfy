import type { AuthContext, LockedTimeQuery, LockedTimeResponse } from '@properfy/shared';
import { addCivilDays } from '@properfy/shared';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import { PLATFORM_TIMEZONE, civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { ILiveDayReadRepository, LockedTimeRawRow } from '../../domain/live-day.read-repository';

export const LOCKED_TIME_ROLES = ['AM', 'OP'] as const;

/** Default range length: today → today + 13 (14 civil days). */
const DEFAULT_RANGE_DAYS = 13;
/** Max inclusive span (FR-036): a span over 31 days is rejected. */
const MAX_SPAN_DAYS = 31;

export interface GetLockedTimeInput {
  actor: AuthContext;
  query: LockedTimeQuery;
}

export interface GetLockedTimeResult {
  response: LockedTimeResponse;
}

/** `round(confirmed / required × 100, 1)`; `null` when the denominator is 0. */
function percent(confirmed: number, required: number): number | null {
  return required === 0 ? null : Math.round((confirmed / required) * 1000) / 10;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/**
 * The "Locked time" indicator (01.13, D21): the rental-tenant confirmation rate for
 * the T-1-eligible routine appointments in a civil-date range, overall and broken
 * down by agency and by region. One aggregated SQL query, zero external calls (D13),
 * cross-tenant (D14 — AM/OP only).
 */
export class GetLockedTimeUseCase {
  constructor(
    private readonly repo: ILiveDayReadRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ actor, query }: GetLockedTimeInput): Promise<GetLockedTimeResult> {
    if (!(LOCKED_TIME_ROLES as readonly string[]).includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view locked time');
    }

    const now = this.clock.now();
    const today = civilDateInTimezone(now, actor.timezone ?? PLATFORM_TIMEZONE);
    const from = query.from ?? today;
    const to = query.to ?? addCivilDays(today, DEFAULT_RANGE_DAYS);

    if (daysBetween(from, to) < 0) {
      throw new ValidationError('The end date is before the start date', undefined, 'LOCKED_TIME_INVALID_RANGE');
    }
    if (daysBetween(from, to) + 1 > MAX_SPAN_DAYS) {
      throw new ValidationError(
        `Pick a range of at most ${MAX_SPAN_DAYS} days`,
        { maxDays: MAX_SPAN_DAYS },
        'LOCKED_TIME_RANGE_TOO_LONG',
      );
    }

    const rows = await this.repo.getLockedTime(from, to);

    const agencyRows = rows.filter((r) => r.dim === 'AGENCY');
    const regionRows = rows.filter((r) => r.dim === 'REGION');

    const overallConfirmed = agencyRows.reduce((sum, r) => sum + r.confirmed, 0);
    const overallRequired = agencyRows.reduce((sum, r) => sum + r.required, 0);

    const byAgency = agencyRows
      .map((r) => ({
        tenantId: r.key as string,
        agencyName: r.label,
        confirmed: r.confirmed,
        required: r.required,
        percent: percent(r.confirmed, r.required),
      }))
      .sort((a, b) => a.agencyName.localeCompare(b.agencyName, 'en-AU'));

    const byRegion = regionRows
      .map((r: LockedTimeRawRow) => ({
        regionId: r.key, // null = "No region"
        regionName: r.key === null ? 'No region' : r.label,
        agencyName: r.regionAgencyName, // null = global region or "No region" (L-F05-13)
        confirmed: r.confirmed,
        required: r.required,
        percent: percent(r.confirmed, r.required),
      }))
      // null region always last, then by name.
      .sort((a, b) => {
        if (a.regionId === null) return 1;
        if (b.regionId === null) return -1;
        return a.regionName.localeCompare(b.regionName, 'en-AU');
      });

    return {
      response: {
        from,
        to,
        generatedAt: now.toISOString(),
        overall: {
          confirmed: overallConfirmed,
          required: overallRequired,
          percent: percent(overallConfirmed, overallRequired),
        },
        byAgency,
        byRegion,
      },
    };
  }
}
