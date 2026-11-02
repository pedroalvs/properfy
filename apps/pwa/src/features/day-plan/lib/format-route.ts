/**
 * Pure formatting helpers for the day plan / route screens. No React, no
 * timezone side effects beyond the explicit `timeZone` argument. Civil-date
 * helpers assemble their output from `Intl.formatToParts` so the result is
 * stable across ICU/Node versions (see `format-display-date` in shared).
 */

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minutes, rounded. `0 min`, `1 min`, `43 min`, `1 h 5 min`, `2 h`. */
export function formatDriveDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** `650 m` below 1 km, else `2.1 km` (one decimal). `null` → `''`. */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export interface LegLike {
  travelS: number | null | undefined;
  distanceM: number | null | undefined;
  waitS: number | null | undefined;
}

/**
 * A leg line: `6 min drive · 1.0 km` plus `· wait 25 min for window` when the
 * arriving stop waits. Empty parts are dropped.
 */
export function formatLeg(leg: LegLike): string {
  const parts: string[] = [];
  const drive = formatDriveDuration(leg.travelS);
  if (drive) parts.push(`${drive} drive`);
  const distance = formatDistance(leg.distanceM);
  if (distance) parts.push(distance);
  if (leg.waitS != null && Number.isFinite(leg.waitS) && leg.waitS > 0) {
    parts.push(`wait ${Math.round(leg.waitS / 60)} min for window`);
  }
  return parts.join(' · ');
}

const longDateFormatters = new Map<string, Intl.DateTimeFormat>();
function longDateFormatter(): Intl.DateTimeFormat {
  let formatter = longDateFormatters.get('en-AU');
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    longDateFormatters.set('en-AU', formatter);
  }
  return formatter;
}

/**
 * A civil date (`YYYY-MM-DD`) as `Friday, 18 Sept`. Parsed at UTC midnight so it
 * never shifts; assembled from parts so the `, ` separator is fixed. Malformed
 * input is returned intact; `null`/`''` → `''`.
 */
export function formatCivilDateLong(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const match = CIVIL_DATE_RE.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;
  const parts: Record<string, string> = {};
  for (const part of longDateFormatter().formatToParts(date)) parts[part.type] = part.value;
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}

const hourFormatters = new Map<string, Intl.DateTimeFormat>();
function hourFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = hourFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
    hourFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/**
 * Time-of-day greeting for an instant in `timeZone`: morning < 12:00,
 * afternoon < 18:00, else evening. Falls back to `Good morning` for unusable
 * input (the header always greets).
 */
export function greetingFor(value: string | Date | null | undefined, timeZone: string): Greeting {
  if (value == null || value === '') return 'Good morning';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Good morning';
  const raw = hourFormatter(timeZone).format(date); // '00'..'23'
  const hour = Number(raw === '24' ? '00' : raw);
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
