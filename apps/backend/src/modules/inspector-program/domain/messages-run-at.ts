import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { civilDateInTimezone, getTimezoneOffsetMinutes } from '../../../shared/domain/timezone-date';

/**
 * The instant the daily program-messages run should fire (L-F08-01): 08:00 in
 * `PLATFORM_TIMEZONE` on the civil day of `now`, or `now` itself if 08:00 has
 * already passed. The 04:45 compute run enqueues the message run with this as
 * `startAfter`. DST-safe: 08:00 is never inside Sydney's 02:00–03:00 transition,
 * so the noon-based offset is exact for it.
 */
export function messagesRunAt(now: Date): Date {
  const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
  const offsetMinutes = getTimezoneOffsetMinutes(today, PLATFORM_TIMEZONE);
  const wall08AsUtc = new Date(`${today}T08:00:00.000Z`).getTime();
  const target = new Date(wall08AsUtc - offsetMinutes * 60_000);
  return now.getTime() < target.getTime() ? target : now;
}
