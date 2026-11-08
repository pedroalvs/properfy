import { addCivilDays, civilDateInTz, PLATFORM_TIMEZONE, RELIABILITY_WINDOW_DAYS } from '@properfy/shared';

export interface SnapshotWindow {
  /** First civil day of the window — `snapshotDate − RELIABILITY_WINDOW_DAYS`. */
  from: string;
  /** Last civil day of the window — `snapshotDate − 1` (yesterday; today is still open, P8). */
  to: string;
}

/**
 * The rolling window a snapshot for `snapshotDate` covers: the 30 complete civil
 * days up to yesterday, `[snapshotDate − 30, snapshotDate − 1]`. Excluding today
 * keeps any same-day recompute producing the same window (idempotence, P8).
 * Pure civil-date math — no timezone.
 */
export function snapshotWindow(snapshotDate: string): SnapshotWindow {
  return {
    from: addCivilDays(snapshotDate, -RELIABILITY_WINDOW_DAYS),
    to: addCivilDays(snapshotDate, -1),
  };
}

/**
 * The civil date (Sydney / `PLATFORM_TIMEZONE`) a snapshot run at `now` is for.
 * Platform jobs resolve "today" on the platform timezone (R3); the explicit tz
 * makes the result independent of the process `TZ`.
 */
export function snapshotDateFor(now: Date): string {
  return civilDateInTz(now, PLATFORM_TIMEZONE);
}
