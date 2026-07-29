import { PLATFORM_TIMEZONE } from '../constants/timezone';

/**
 * Canonical user-facing date/time rendering for the whole platform.
 *
 * Shapes (Australian convention, matching `toLocaleTimeString('en-AU')`):
 *   civil date  28/07/2026
 *   wall time   9:00 am            (hour not zero-padded, meridiem lowercase, no seconds)
 *   range       9:00 am – 11:00 am
 *   instant     28/07/2026, 2:12 pm
 *
 * ## Three distinct types, three distinct functions
 *
 * The API deliberately refuses to guess. Every value the product displays is one
 * of exactly three things, and the caller declares which by choosing a function:
 *
 * | Kind           | Example fields                        | Timezone |
 * |----------------|---------------------------------------|----------|
 * | **Civil date** | `scheduledDate`, `periodStart`, `dateOfBirth` (`@db.Date`) | none — ever |
 * | **Wall time**  | `timeSlotStart`, `timeSlotEnd` (`HH:mm`)                    | none — ever |
 * | **Instant**    | `createdAt`, `effectiveAt` (`DateTime`)                     | required  |
 *
 * A civil date is a calendar day: an inspection on the 28th is on the 28th in
 * every timezone. Converting it is the bug, not the fix. A wall time is the same
 * — 9:00 am local is 9:00 am local. Only an **instant** denotes a point in time
 * and therefore needs a timezone to render.
 *
 * An earlier version of this module took `string | Date` and inferred the kind
 * from the input type. That inference was unsound: the same instant rendered as
 * two different days depending on whether it arrived as a string or a `Date`,
 * and since every frontend receives JSON, instants are *always* strings there.
 * The kind now comes from the function name, so the ambiguity cannot recur.
 *
 * ## Multi-timezone
 *
 * `timeZone` is a parameter, not a constant, defaulting to `PLATFORM_TIMEZONE`.
 * Per-agency timezone support therefore means threading a value into the two
 * instant formatters; civil dates and wall times are already correct for every
 * agency because they carry no timezone at all.
 *
 * ## Error behaviour
 *
 * These run in render paths, so they never throw: nullish/empty input yields
 * `''`, and unparseable input is returned unchanged so bad data stays visible
 * rather than silently blanking a field.
 */

/** Spaced en-dash (U+2013) — the range separator used across the product. */
const RANGE_SEPARATOR = ' – ';

/**
 * A leading `YYYY-MM-DD`, anchored so a trailing time (or nothing) is accepted
 * but arbitrary junk is not: `'2026-07-28garbage'` must fall through to the
 * unparseable branch rather than silently rendering as the 28th.
 */
const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])/;

const WALL_TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/**
 * `Intl.DateTimeFormat` construction is comparatively expensive and these
 * formatters render one row at a time in tables and lists, so instances are
 * memoised per timezone.
 */
const civilPartsFormatters = new Map<string, Intl.DateTimeFormat>();
const wallTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function civilPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = civilPartsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    civilPartsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = wallTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      // h23 pins 00..23. `hour12: false` was historically allowed to resolve to
      // h24, which renders midnight as '24:00' on older ICU builds.
      hourCycle: 'h23',
    });
    wallTimeFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Calendar-aware validity check (rejects 31/02, honours leap years). */
function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this one.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Reads formatted parts by name rather than splitting the formatted string,
 * which keeps this immune to locale-data drift across the different ICU builds
 * the four workspaces run on.
 */
function partsOf(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
  return out;
}

/**
 * Formats a **civil date** (a calendar day) as `dd/mm/yyyy`. Never applies a
 * timezone — the result is identical for every agency.
 *
 * Accepts the `YYYY-MM-DD` wire shape, or a `Date` originating from a Prisma
 * `@db.Date` column, which Prisma anchors at UTC midnight. Passing a genuine
 * instant here interprets its **UTC** calendar day; use `formatInstantDate` when
 * the value denotes a point in time.
 */
export function formatCivilDate(value: string | Date | null | undefined): string {
  if (value == null) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    // @db.Date is UTC-midnight anchored, so UTC components ARE the civil date.
    return `${pad2(value.getUTCDate())}/${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }

  if (value === '') return '';

  const match = CIVIL_DATE_RE.exec(value);
  if (!match) return value;

  const [, year = '', month = '', day = ''] = match;
  if (!isValidYmd(Number(year), Number(month), Number(day))) return value;

  return `${day}/${month}/${year}`;
}

/**
 * Formats a **wall time** (`HH:mm`, optionally `HH:mm:ss`) as `9:00 am`.
 *
 * Never applies a timezone: appointment time slots are already local wall time,
 * and converting them would shift every appointment by the UTC offset.
 */
export function formatWallTime(value: string | null | undefined): string {
  if (value == null || value === '') return '';

  const match = WALL_TIME_RE.exec(value.trim());
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return value;

  const meridiem = hour < 12 ? 'am' : 'pm';
  // 0 and 12 both display as 12 on a 12-hour clock.
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${hour12}:${pad2(minute)} ${meridiem}`;
}

/** Internal: formats a wall time, or reports that it could not be parsed. */
function tryFormatWallTime(value: string): string | null {
  const formatted = formatWallTime(value);
  // formatWallTime echoes its input verbatim when it cannot parse it.
  return formatted === value && !WALL_TIME_RE.test(value.trim()) ? null : formatted;
}

/**
 * Formats a start/end wall-time pair as `9:00 am – 11:00 am`.
 *
 * When only one end is present, that end is returned alone rather than emitting
 * a dangling separator.
 */
export function formatWallTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const formattedStart = formatWallTime(start);
  const formattedEnd = formatWallTime(end);

  if (formattedStart && formattedEnd) return `${formattedStart}${RANGE_SEPARATOR}${formattedEnd}`;
  return formattedStart || formattedEnd;
}

/**
 * Formats a pre-joined window string (`'08:00-13:00'`) as `8:00 am – 1:00 pm`.
 *
 * Several APIs hand the window back already joined. Both ends must parse; if
 * either fails the raw input is returned untouched, so a half-formatted result
 * like `'8:00 am – lunch'` can never reach a user.
 */
export function formatWallTimeWindow(value: string | null | undefined): string {
  if (value == null || value === '') return '';

  const parts = value.split(/\s*[-–]\s*/);
  if (parts.length !== 2) return value;

  const [start = '', end = ''] = parts;
  const formattedStart = tryFormatWallTime(start);
  const formattedEnd = tryFormatWallTime(end);
  if (formattedStart == null || formattedEnd == null) return value;

  return `${formattedStart}${RANGE_SEPARATOR}${formattedEnd}`;
}

/** Resolves an instant argument to a `Date`, or null when unusable. */
function toInstant(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats the calendar day an **instant** falls on, in `timeZone`, as `dd/mm/yyyy`.
 *
 * Use this for `DateTime` columns (`createdAt`, `effectiveAt`) rendered as a
 * date. For a `@db.Date` calendar day use `formatCivilDate` instead — running a
 * civil date through here would shift it.
 *
 * ISO strings should carry an offset (`Z` or `±hh:mm`); a zone-less string is
 * parsed as runtime-local per the ECMAScript spec and will differ by machine.
 */
export function formatInstantDate(
  value: string | Date | null | undefined,
  timeZone: string = PLATFORM_TIMEZONE,
): string {
  if (value == null || value === '') return '';

  const date = toInstant(value);
  if (!date) return value instanceof Date ? '' : value;

  const parts = partsOf(civilPartsFormatter(timeZone), date);
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/**
 * Formats an **instant** as `28/07/2026, 2:12 pm` in `timeZone`.
 *
 * @see formatInstantDate for the zoned-input requirement.
 */
export function formatInstantDateTime(
  value: string | Date | null | undefined,
  timeZone: string = PLATFORM_TIMEZONE,
): string {
  if (value == null || value === '') return '';

  const date = toInstant(value);
  if (!date) return value instanceof Date ? '' : value;

  const dateParts = partsOf(civilPartsFormatter(timeZone), date);
  const timeParts = partsOf(wallTimeFormatter(timeZone), date);

  // Belt-and-braces: h23 yields 00..23, but older ICU could emit '24' for midnight.
  const hour = timeParts.hour === '24' ? '00' : (timeParts.hour ?? '00');
  const wallTime = `${hour}:${timeParts.minute ?? '00'}`;

  return `${dateParts.day}/${dateParts.month}/${dateParts.year}, ${formatWallTime(wallTime)}`;
}
