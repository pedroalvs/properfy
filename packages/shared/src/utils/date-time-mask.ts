/**
 * Pure masking/parsing core for the locale-proof date and time inputs.
 *
 * Native `<input type="date">` and `<input type="time">` render in the browser's
 * locale, which the app cannot control: a US-configured browser shows mm/dd/yyyy
 * and 24-hour time no matter what the page does. These helpers back custom text
 * inputs that always present `dd/mm/yyyy` and `h:mm am`.
 *
 * ## Masking is separator-aware, never a flat digit buffer
 *
 * The tempting implementation strips every non-digit and re-slices by position.
 * That loses information across keystrokes: after typing `1`,`3` a time field
 * shows `1:3` (hour 1, minute 3), but re-concatenating its digits yields `13`,
 * so the next keystroke re-slices to `13:0` instead of `1:30`. The separator the
 * mask already inserted IS the segment boundary, so these functions split on it
 * rather than throwing it away.
 *
 * Values in and out are always canonical — `YYYY-MM-DD` and 24-hour `HH:mm`.
 * Only the masked text is localised.
 */

export const DATE_PLACEHOLDER = 'dd/mm/yyyy';
export const TIME_PLACEHOLDER = 'h:mm am';

export type Meridiem = 'am' | 'pm';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MASKED_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const MASKED_TIME_RE = /^(\d{1,2}):(\d{2})\s*([ap])m?$/i;

function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

/** Calendar-aware validity check (rejects 31/02, honours leap years). */
export function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Expands a 2-digit year with a sliding window pivoted 20 years ahead of now.
 *
 * `26` -> 2026 and `86` -> 1986. A fixed `2000 + yy` would break the inspector
 * date-of-birth field, the only backward-looking date in the product.
 */
export function expandTwoDigitYear(yy: number, nowYear: number): number {
  const century = Math.floor(nowYear / 100) * 100;
  const pivot = (nowYear % 100) + 20;
  return yy <= pivot ? century + yy : century - 100 + yy;
}

/* ────────────────────────────── date ────────────────────────────── */

/**
 * Normalises whatever is currently in the field into masked `dd/mm/yyyy` text.
 *
 * Splits on `/` so a segment the mask has already delimited keeps its identity,
 * and auto-pads a leading digit that cannot begin a two-digit segment (day 4-9,
 * month 2-9) so the caret advances the way a native date field does.
 */
export function maskDateText(raw: string): string {
  // Treat any conventional separator as a boundary so a pasted '15.6.26' or
  // '15-6-2026' segments correctly; without this, a single-digit month in a
  // pasted value misaligns everything after it.
  const segments = raw.split(/[/.\-\s]/);

  let day: string;
  let month: string;
  let year: string;

  if (segments.length === 1) {
    // No separator yet (fresh typing, or a paste of bare digits).
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    day = digits.slice(0, 2);
    month = digits.slice(2, 4);
    year = digits.slice(4, 8);
  } else {
    day = (segments[0] ?? '').replace(/\D/g, '').slice(0, 2);
    month = (segments[1] ?? '').replace(/\D/g, '').slice(0, 2);
    year = (segments[2] ?? '').replace(/\D/g, '').slice(0, 4);

    // A separator the user typed (or the mask already inserted) closes the
    // segment before it, so a single digit there is complete. Without this a
    // pasted '1/6/2026' collapses to '1' — the day never reaches two digits, so
    // everything after it is dropped — and pressing '/' after '1' looks dead.
    if (day.length === 1) day = pad2(day);
    if (segments.length > 2 && month.length === 1) month = pad2(month);
  }

  // Otherwise infer: 4-9 cannot start a two-digit day, 2-9 cannot start a
  // two-digit month, so those complete their segment on the first keystroke.
  if (day.length === 1 && day >= '4') day = pad2(day);
  if (day.length === 2 && month.length === 1 && month >= '2') month = pad2(month);

  let text = day;
  if (day.length === 2) text += '/' + month;
  if (day.length === 2 && month.length === 2) text += '/' + year;
  return text;
}

/**
 * Removes one unit of input from the end of masked date text.
 *
 * Backspace has to be handled explicitly: re-masking `04/05` would immediately
 * re-append the `/`, so the key would appear to do nothing.
 */
export function backspaceDateText(text: string): string {
  const trimmed = text.replace(/\/$/, '');
  return maskDateText(trimmed.slice(0, -1));
}

/** `'2026-07-28'` -> `'28/07/2026'`; anything else -> `''`. */
export function isoDateToMasked(iso: string): string {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return '';
  const [, year = '', month = '', day = ''] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Parses masked text to canonical `YYYY-MM-DD`, or null when it is incomplete
 * or not a real calendar date.
 */
export function maskedToIsoDate(text: string, nowYear: number): string | null {
  const match = MASKED_DATE_RE.exec(text.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3] ?? '';
  const year = rawYear.length === 4 ? Number(rawYear) : expandTwoDigitYear(Number(rawYear), nowYear);

  if (!isValidYmd(year, month, day)) return null;
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Accepts a wholesale replacement that is already canonical `YYYY-MM-DD`.
 *
 * The mask can never produce that shape, so this cannot fire mid-typing. It
 * exists because Playwright's `fill()`, browser autofill and pasting a
 * spreadsheet cell all replace the entire value at once.
 */
export function coerceIsoDate(raw: string): string | null {
  const match = ISO_DATE_RE.exec(raw.trim());
  if (!match) return null;
  return isValidYmd(Number(match[1]), Number(match[2]), Number(match[3])) ? raw.trim() : null;
}

/* ────────────────────────────── time ────────────────────────────── */

/** The three parts of a partially-typed time. */
export interface TimeParts {
  hour: string;
  minute: string;
  meridiem: Meridiem | null;
}

/**
 * Normalises whatever is currently in the field into masked `h:mm am` text.
 *
 * Splits on `:` for the same reason `maskDateText` splits on `/`: the hour is
 * rendered without a leading zero, so re-concatenating the digits would make
 * `1:3` indistinguishable from `13`.
 */
export function maskTimeText(raw: string): string {
  return renderTimeParts(parseTimeParts(raw));
}

/** Extracts hour/minute/meridiem from partially-typed text. */
export function parseTimeParts(raw: string): TimeParts {
  const lower = raw.toLowerCase();

  // The meridiem is whatever a/p appears after the digits, if any.
  const meridiemMatch = /([ap])/.exec(lower.replace(/^[^ap]*/, '') || '');
  const meridiem: Meridiem | null = meridiemMatch
    ? meridiemMatch[1] === 'p'
      ? 'pm'
      : 'am'
    : null;

  const digitsPart = lower.replace(/[ap]m?/g, '');
  const segments = digitsPart.split(':');

  let hour: string;
  let minute: string;

  if (segments.length === 1) {
    const digits = digitsPart.replace(/\D/g, '').slice(0, 4);
    // A leading 0 or 1 may still be the first of a two-digit hour (01..12);
    // 2-9 cannot be, so it completes the hour immediately.
    if (digits.length <= 1) {
      hour = digits;
      minute = '';
    } else if (digits[0] === '0' || digits[0] === '1') {
      const twoDigitHour = Number(digits.slice(0, 2));
      if (twoDigitHour >= 1 && twoDigitHour <= 12) {
        hour = digits.slice(0, 2);
        minute = digits.slice(2, 4);
      } else {
        hour = digits.slice(0, 1);
        minute = digits.slice(1, 3);
      }
    } else {
      hour = digits.slice(0, 1);
      minute = digits.slice(1, 3);
    }
  } else {
    hour = (segments[0] ?? '').replace(/\D/g, '').slice(0, 2);
    minute = (segments[1] ?? '').replace(/\D/g, '').slice(0, 2);
  }

  return { hour, minute, meridiem };
}

/** Renders parts back to masked text. */
export function renderTimeParts(parts: TimeParts): string {
  const { hour, minute, meridiem } = parts;
  if (!hour) return meridiem ? '' : '';

  // 2-9 and a complete 01..12 finish the hour. A non-empty minute finishes it
  // too: '1' alone could still become '12', but once a minute digit exists the
  // hour is settled — without this the minute is silently dropped for hours 1
  // and 0, which is exactly the `1`,`3`,`0` -> `1:30` case.
  const hourComplete = hour.length === 2 || hour >= '2' || minute.length > 0;
  let text = hour.length === 2 ? String(Number(hour)) : hour;
  if (hourComplete) text += ':' + minute;
  if (meridiem) text += ' ' + meridiem;
  return text;
}

/** Removes one unit of input from the end of masked time text. */
export function backspaceTimeText(text: string): string {
  const parts = parseTimeParts(text);
  if (parts.meridiem) return renderTimeParts({ ...parts, meridiem: null });
  if (parts.minute) return renderTimeParts({ ...parts, minute: parts.minute.slice(0, -1) });
  return renderTimeParts({ ...parts, hour: parts.hour.slice(0, -1), minute: '' });
}

/** Sets (or replaces) the meridiem on partially-typed text. */
export function applyMeridiem(text: string, meridiem: Meridiem): string {
  return renderTimeParts({ ...parseTimeParts(text), meridiem });
}

/** `'13:30'` -> `'1:30 pm'`; anything else -> `''`. */
export function wallTimeToMasked(hhmm: string): string {
  const match = WALL_TIME_RE.exec(hhmm);
  if (!match) return '';
  const hour24 = Number(match[1]);
  const meridiem: Meridiem = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${match[2]} ${meridiem}`;
}

/** Converts a 12-hour reading to canonical 24-hour `HH:mm`. */
export function to24h(hour12: number, minute: number, meridiem: Meridiem): string {
  const hour24 = meridiem === 'am' ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${pad2(hour24)}:${pad2(minute)}`;
}

/**
 * Parses masked text to canonical 24-hour `HH:mm`, or null when incomplete.
 *
 * A missing meridiem always yields null: the product deliberately never guesses
 * am vs pm, because a silent wrong guess books an inspection twelve hours out.
 * The field stays invalid until the user states which it is.
 */
export function maskedToWallTime(text: string): string | null {
  const match = MASKED_TIME_RE.exec(text.trim());
  if (!match) return null;

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;

  const meridiem: Meridiem = (match[3] ?? '').toLowerCase() === 'p' ? 'pm' : 'am';
  return to24h(hour12, minute, meridiem);
}

/**
 * Accepts a wholesale replacement already in canonical 24-hour `HH:mm`.
 *
 * @see coerceIsoDate — same rationale (Playwright `fill()`, autofill, paste).
 */
export function coerceWallTime(raw: string): string | null {
  return WALL_TIME_RE.test(raw.trim()) ? raw.trim() : null;
}
