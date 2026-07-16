/**
 * DST-safe wall-time -> UTC conversion helpers.
 *
 * Wall-clock -> UTC uses the offset actually in effect at the target wall time,
 * resolved with two probe passes: the first guess can land on the wrong side of a
 * DST change, and the second pass corrects it. This keeps civil-day boundaries
 * exact on the 23h/25h DST-transition days.
 */

/** UTC offset in minutes (+ = ahead of UTC) actually in effect at the given INSTANT in the timezone. */
function offsetMinutesAtInstant(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';

  let localHour = parseInt(get('hour'), 10);
  if (localHour === 24) localHour = 0;
  const localAsUtc = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    localHour,
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10),
  );
  return Math.round((localAsUtc - instant.getTime()) / 60_000);
}

/**
 * Convert a wall-clock date + time (YYYY-MM-DD, HH:mm) in the given IANA timezone
 * to the UTC instant it represents. Nonexistent/ambiguous DST wall times resolve
 * deterministically via the probe offset.
 */
export function zonedWallTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const wallMs = new Date(`${dateStr}T${timeStr}:00.000Z`).getTime();
  if (timezone === 'UTC') return new Date(wallMs);
  const guess = offsetMinutesAtInstant(new Date(wallMs), timezone);
  const refined = offsetMinutesAtInstant(new Date(wallMs - guess * 60_000), timezone);
  return new Date(wallMs - refined * 60_000);
}

/** Advance a YYYY-MM-DD civil date by one calendar day (pure string math, no timezone). */
function nextCivilDay(dateStr: string): string {
  const next = new Date(`${dateStr}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * The last instant of the given civil day in the timezone: 1ms before the NEXT civil
 * midnight. Derived from the next midnight (rather than a fixed 23:59:59.999) so it
 * stays correct on DST-transition days, where the civil day is 23h or 25h long.
 */
export function endOfCivilDayInTz(dateStr: string, timezone: string): Date {
  return new Date(zonedWallTimeToUtc(nextCivilDay(dateStr), '00:00', timezone).getTime() - 1);
}
