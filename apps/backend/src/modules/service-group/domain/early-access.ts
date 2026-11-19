import {
  addCivilDays,
  formatInstantTime,
  formatShortDayLabel,
  PLATFORM_TIMEZONE,
} from '@properfy/shared';

/**
 * The resolved early-access window for one request, or `null` ("no window — show
 * everything"). Instants are UTC **text** with the trailing `Z` stripped so the
 * repository's `::timestamp` cast is independent of the SQL session timezone;
 * `protectedFrom` and `latestSnapshotDate` are civil dates (`YYYY-MM-DD`) in
 * PLATFORM_TIMEZONE.
 */
export interface EarlyAccessParams {
  /** The window length H in hours — used to compute when an in-window offer opens to all. */
  hours: number;
  /** `now − hours`, UTC text without `Z`. A group is in-window only if `published_at > cutoffUtc`. */
  cutoffUtc: string;
  /** Activation instant, UTC text without `Z`. In-window only if `published_at >= enabledAtUtc` (L-F08-08). */
  enabledAtUtc: string;
  /** `todaySydney + 2` civil date; gated only if `scheduled_date >= protectedFrom` (today/D+1 never gated). */
  protectedFrom: string;
  /** Reliability score threshold for the minimum level X. */
  minScore: number;
  /** Civil date of the latest reliability snapshot the EXISTS scores against. */
  latestSnapshotDate: string;
}

/** Minimal logger port so the pure resolver can flag the manual-edit-only state without importing infrastructure. */
export interface EarlyAccessLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface ResolveEarlyAccessInput {
  enabled: boolean;
  /** H — the window length in hours. */
  hours: number;
  minScore: number;
  /** Latest reliability snapshot civil date, or null when no snapshot exists yet. */
  latestSnapshotDate: string | null;
  /** True when the viewing inspector is already at/above level X. */
  viewerQualifies: boolean;
  now: Date;
  /** Today's civil date in PLATFORM_TIMEZONE (computed by the caller). */
  todaySydney: string;
  /** Server-owned activation instant (ISO-8601 Z), or null. */
  enabledAt: string | null;
}

/**
 * Resolve the early-access window for a request, or `null` to show everything.
 * Returns null when: disabled; the viewer qualifies; no snapshot exists (nobody
 * can qualify); or (L-F08-08) early access is on but `enabledAt` is null — the
 * last case also warns, since only a manual DB edit produces it.
 */
export function resolveEarlyAccessParams(
  input: ResolveEarlyAccessInput,
  logger?: EarlyAccessLogger,
): EarlyAccessParams | null {
  const { enabled, hours, minScore, latestSnapshotDate, viewerQualifies, now, todaySydney, enabledAt } =
    input;

  if (!enabled) return null;
  if (viewerQualifies) return null;
  if (latestSnapshotDate === null) return null;
  if (enabledAt === null) {
    logger?.warn({}, 'marketplace.early_access_missing_enabled_at');
    return null;
  }

  const cutoffUtc = new Date(now.getTime() - hours * 3_600_000).toISOString().replace('Z', '');
  const enabledAtUtc = enabledAt.replace('Z', '');
  const protectedFrom = addCivilDays(todaySydney, 2);

  return { hours, cutoffUtc, enabledAtUtc, protectedFrom, minScore, latestSnapshotDate };
}

/** The instant an in-window offer opens to every eligible inspector: `publishedAt + H hours`. */
export function offerOpensAt(publishedAt: Date, params: EarlyAccessParams): Date {
  return new Date(publishedAt.getTime() + params.hours * 3_600_000);
}

/** The raw per-group state the accept path reads before applying `isGroupInEarlyAccess`. */
export interface EarlyAccessGroupState {
  publishedAt: Date | null;
  /** The group's scheduled civil date (`YYYY-MM-DD`). */
  scheduledDate: string;
  /** Whether at least one qualified inspector is eligible for this group. */
  hasQualifiedEligible: boolean;
}

/**
 * The single in-memory truth for "is this group still restricted to high-level
 * inspectors" — encodes the same predicate as the repository's SQL exclusion so
 * the read paths (SQL) and the accept path (this function) never disagree.
 */
export function isGroupInEarlyAccess(
  state: EarlyAccessGroupState,
  params: EarlyAccessParams | null,
): boolean {
  if (!params) return false;
  const { publishedAt, scheduledDate, hasQualifiedEligible } = state;
  if (!publishedAt) return false;
  if (publishedAt.getTime() <= new Date(`${params.cutoffUtc}Z`).getTime()) return false;
  if (publishedAt.getTime() < new Date(`${params.enabledAtUtc}Z`).getTime()) return false;
  if (scheduledDate < params.protectedFrom) return false;
  if (!hasQualifiedEligible) return false;
  return true;
}

/**
 * The 403 message: the day and wall time (PLATFORM_TIMEZONE) the offer opens to
 * everyone. Uses the ICU-version-stable shared helpers (weekday+day+month, and
 * 12-hour wall time), so the text is identical regardless of the process TZ.
 */
export function formatOpensAt(opensAt: Date): string {
  const day = formatShortDayLabel(opensAt, PLATFORM_TIMEZONE);
  const time = formatInstantTime(opensAt, PLATFORM_TIMEZONE);
  return `This offer opens to all inspectors on ${day} at ${time}.`;
}
