import { PLATFORM_TIMEZONE } from '@properfy/shared';

/**
 * Pure freshness logic for the Inspector performance screen (L-F07-02 / L-F07-10).
 * It decides *which* banners to show from the response's freshness fields and an
 * injected `now`; the copy/formatting lives in `FreshnessBanners`. Keeping it
 * formatting-free makes the Sydney-05:00 gate and the 15-minute overdue gate
 * trivially testable with `TZ` pinned away from Sydney and a fixed clock.
 */

/** Minutes after a weights change before the recompute is considered overdue. */
export const RECOMPUTE_OVERDUE_MINUTES = 15;

/** Hour (Sydney wall clock) from which the stale banner is shown — before it, yesterday's snapshot is expected. */
export const STALE_BANNER_FROM_HOUR = 5;

export interface FreshnessInput {
  isStale: boolean;
  snapshotDate: string | null;
  settingsUpdatedAt: string | null;
  computedAt: string | null;
  now: Date;
}

export interface FreshnessBannerState {
  /** Stale banner — the nightly job hasn't produced today's snapshot and it's past 05:00 Sydney. */
  stale: { snapshotDate: string } | null;
  /** Recompute banner — weights saved after the last compute; `overdue` after 15 min. */
  recompute: { changedAt: string; overdue: boolean } | null;
}

/** Hour (0–23) of `instant` on the Sydney wall clock. Numeric extraction is ICU-version stable. */
function sydneyHour(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLATFORM_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
  // `hour12: false` can emit "24" at midnight in some engines.
  const parsed = Number(hour);
  return parsed === 24 ? 0 : parsed;
}

export function resolveFreshness(input: FreshnessInput): FreshnessBannerState {
  const stale =
    input.isStale && input.snapshotDate !== null && sydneyHour(input.now) >= STALE_BANNER_FROM_HOUR
      ? { snapshotDate: input.snapshotDate }
      : null;

  let recompute: FreshnessBannerState['recompute'] = null;
  if (input.settingsUpdatedAt !== null && input.computedAt !== null) {
    const changed = new Date(input.settingsUpdatedAt).getTime();
    const computed = new Date(input.computedAt).getTime();
    if (changed > computed) {
      const minutesSinceChange = (input.now.getTime() - changed) / 60_000;
      recompute = { changedAt: input.settingsUpdatedAt, overdue: minutesSinceChange >= RECOMPUTE_OVERDUE_MINUTES };
    }
  }

  return { stale, recompute };
}

/** True when either banner would render — lets callers skip the wrapper entirely. */
export function hasFreshnessBanner(state: FreshnessBannerState): boolean {
  return state.stale !== null || state.recompute !== null;
}
