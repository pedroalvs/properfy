import { PLATFORM_TIMEZONE } from '../constants/timezone';

/**
 * Canonical user-facing date/time rendering for the whole platform.
 *
 * Shapes (Australian convention, matching `toLocaleTimeString('en-AU')`):
 *   date      28/07/2026
 *   time      9:00 am           (hour not zero-padded, meridiem lowercase, no seconds)
 *   range     9:00 am – 11:00 am
 *   date-time 28/07/2026, 2:12 pm
 *
 * THE DISTINCTION THAT MATTERS — these take two different kinds of input and it
 * is deliberate that they are not unified:
 *
 *   `formatDisplayTime` takes a bare HH:mm WALL-CLOCK string and performs NO
 *   timezone conversion. Appointment time slots (`time_slot_start`/`time_slot_end`)
 *   are already Sydney wall time; passing them through a timezone converter would
 *   shift them by the UTC offset.
 *
 *   `formatDisplayDateTime` takes an INSTANT (Date or ISO timestamp) and DOES
 *   convert it to `PLATFORM_TIMEZONE`.
 *
 * Getting those backwards silently moves appointments by 10-11 hours, so the
 * distinction is pinned by tests named after it.
 *
 * All formatters degrade gracefully instead of throwing: nullish/empty input
 * yields `''`, and unparseable input is returned unchanged so bad data stays
 * visible rather than silently blanking a field mid-render.
 */

/** Spaced en-dash (U+2013) — the range separator used across the product. */
const RANGE_SEPARATOR = ' – ';

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Calendar-aware validity check (rejects 31/02, honours leap years). */
function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this one.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Extracts the civil date parts of a `Date` as seen in the platform timezone. */
function civilPartsInPlatformTz(date: Date): { year: string; month: string; day: string } {
  // en-CA yields YYYY-MM-DD, which is trivial to split.
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year = '', month = '', day = ''] = iso.split('-');
  return { year, month, day };
}

/**
 * Formats a calendar day as `dd/mm/yyyy`.
 *
 * Strings are treated as CIVIL dates: only the leading `YYYY-MM-DD` is read and
 * any time suffix is ignored, so a `@db.Date` arriving as
 * `'2026-07-28T00:00:00.000Z'` never shifts a day in a runtime behind UTC.
 *
 * `Date` instances are resolved to the calendar day they fall on in
 * `PLATFORM_TIMEZONE`. Use `formatDisplayDateTime` when the time of day matters.
 */
export function formatDisplayDate(input: string | Date | null | undefined): string {
  if (input == null) return '';

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '';
    const { year, month, day } = civilPartsInPlatformTz(input);
    return `${day}/${month}/${year}`;
  }

  if (input === '') return '';

  const match = CIVIL_DATE_RE.exec(input);
  if (!match) return input;

  const [, year = '', month = '', day = ''] = match;
  if (!isValidYmd(Number(year), Number(month), Number(day))) return input;

  return `${day}/${month}/${year}`;
}

/**
 * Formats a bare `HH:mm` (or `HH:mm:ss`) wall-clock string as `9:00 am`.
 *
 * Performs NO timezone conversion — the input is already platform-local wall
 * time. Seconds, if present, are dropped.
 */
export function formatDisplayTime(input: string | null | undefined): string {
  if (input == null || input === '') return '';

  const match = TIME_RE.exec(input.trim());
  if (!match) return input;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return input;

  const meridiem = hour < 12 ? 'am' : 'pm';
  // 0 and 12 both display as 12 on a 12-hour clock.
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${hour12}:${pad2(minute)} ${meridiem}`;
}

/**
 * Formats a start/end pair as `9:00 am – 11:00 am`.
 *
 * When only one end is present, that end is returned alone rather than emitting
 * a dangling separator.
 */
export function formatDisplayTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const formattedStart = formatDisplayTime(start);
  const formattedEnd = formatDisplayTime(end);

  if (formattedStart && formattedEnd) return `${formattedStart}${RANGE_SEPARATOR}${formattedEnd}`;
  return formattedStart || formattedEnd;
}

/**
 * Formats a combined window string (`'08:00-13:00'`) as `8:00 am – 1:00 pm`.
 *
 * Several APIs hand back the window pre-joined. Splitting and re-formatting is
 * correct; string-replacing the separator is not, since it leaves 24-hour times.
 */
export function formatDisplayTimeWindow(input: string | null | undefined): string {
  if (input == null || input === '') return '';

  const parts = input.split(/\s*[-–]\s*/);
  if (parts.length !== 2) return input;

  const [start = '', end = ''] = parts;
  const formatted = formatDisplayTimeRange(start, end);

  // If neither end parsed, hand back the original rather than a mangled echo.
  return formatted === `${start}${RANGE_SEPARATOR}${end}` ? input : formatted;
}

/**
 * Formats an instant as `28/07/2026, 2:12 pm` in `PLATFORM_TIMEZONE`.
 *
 * Unlike `formatDisplayTime`, this DOES convert timezones — the input is a point
 * in time (a `created_at`, an `effective_at`), not a wall-clock string.
 */
export function formatDisplayDateTime(input: string | Date | null | undefined): string {
  if (input == null || input === '') return '';

  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return input instanceof Date ? '' : input;

  const { year, month, day } = civilPartsInPlatformTz(date);

  // en-GB with hour12:false gives a plain 24h HH:mm we can reuse the wall-clock
  // formatter on, keeping one implementation of the 12-hour conversion.
  const wallTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: PLATFORM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  // en-GB renders midnight as '24:00' in some ICU versions; normalise to '00:00'.
  const normalised = wallTime.startsWith('24:') ? `00:${wallTime.slice(3)}` : wallTime;

  return `${day}/${month}/${year}, ${formatDisplayTime(normalised)}`;
}
