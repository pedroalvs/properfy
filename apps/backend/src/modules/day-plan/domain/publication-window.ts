import {
  PLATFORM_TIMEZONE,
  DAY_PLAN_PUBLISH_LOCAL_TIME,
  addCivilDays,
  zonedWallTimeToUtc,
} from '@properfy/shared';

/**
 * The next day's plan auto-publishes at 19:30 the evening before, in the given
 * timezone. `isPublicationOpen(date, now, tz)` is true once `now` has reached
 * 19:30 on `date − 1` in `tz`. For today and past dates the threshold is already
 * behind us, so it is always open. (L-F04-02; `addCivilDays(..., -1)` — there is
 * no `previousCivilDay`.)
 */
export function isPublicationOpen(date: string, now: Date, timezone: string): boolean {
  const threshold = zonedWallTimeToUtc(
    addCivilDays(date, -1),
    DAY_PLAN_PUBLISH_LOCAL_TIME,
    timezone,
  );
  return now.getTime() >= threshold.getTime();
}

/**
 * A read/write by the inspector may only CREATE or PUBLISH a not-yet-published
 * D+1 plan when the 19:30 window is open in BOTH the inspector's timezone and
 * the platform timezone — so an inspector in a timezone ahead of the platform
 * never publishes before the platform's own T-1 has run (L-F04-02). A plan that
 * already has `published_at` is returned regardless of the local hour; that is
 * decided by the caller, not here.
 */
export function isPublicationOpenForInspector(
  date: string,
  now: Date,
  inspectorTimezone: string,
): boolean {
  return (
    isPublicationOpen(date, now, inspectorTimezone) &&
    isPublicationOpen(date, now, PLATFORM_TIMEZONE)
  );
}
