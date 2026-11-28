import {
  PLATFORM_TIMEZONE,
  GROUP_MOVE_SAME_DAY_CUTOFF_LOCAL_TIME,
  zonedWallTimeToUtc,
} from '@properfy/shared';
import { civilDateInTimezone, nextCivilDay } from '../../../shared/domain/timezone-date';

/**
 * Eligibility rules for choosing a "move" destination group.
 *
 * Destinations are active groups scheduled today or in the future. Today's group is
 * only a valid destination before the Sydney cutoff (`GROUP_MOVE_SAME_DAY_CUTOFF_LOCAL_TIME`,
 * 18:50) — after that the day's routes are locking for the evening. Minute-granular,
 * so the cutoff is a wall-time instant compared against `now`, modelled on the
 * day-plan publication window.
 */

/** Whether a CURRENT-day group is still a valid move destination at `now`. */
export function isSameDayGroupStillMovable(
  now: Date,
  timezone: string = PLATFORM_TIMEZONE,
): boolean {
  const today = civilDateInTimezone(now, timezone);
  const cutoff = zonedWallTimeToUtc(today, GROUP_MOVE_SAME_DAY_CUTOFF_LOCAL_TIME, timezone);
  return now.getTime() < cutoff.getTime();
}

/**
 * The lowest `scheduled_date` (civil date string) a group may have to be offered as
 * a destination: today while still movable, otherwise tomorrow. `scheduled_date` is
 * a `@db.Date` pinned to UTC midnight of a Sydney civil date, so this string is
 * compared with `>= :lowerBound::date` in SQL exactly like the add-to-group query's
 * `startOfPlatformToday()` anchor.
 */
export function moveTargetLowerBoundDate(
  now: Date,
  timezone: string = PLATFORM_TIMEZONE,
): string {
  const today = civilDateInTimezone(now, timezone);
  return isSameDayGroupStillMovable(now, timezone) ? today : nextCivilDay(today);
}

/** Whether a group's `scheduled_date` is the current Sydney civil day. */
export function isCurrentDayGroup(
  scheduledDate: Date,
  now: Date,
  timezone: string = PLATFORM_TIMEZONE,
): boolean {
  return civilDateInTimezone(scheduledDate, timezone) === civilDateInTimezone(now, timezone);
}
