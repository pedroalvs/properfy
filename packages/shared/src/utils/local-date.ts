/**
 * Resolves an instant to its YYYY-MM-DD civil date in the given IANA timezone.
 *
 * Use this for any real timestamp (`created_at`, `sent_at`, …). Reading the UTC
 * date off an instant instead gives the PREVIOUS day for roughly ten hours of
 * every day in Sydney.
 */
export function civilDateInTz(instant: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(instant); // en-CA produces ISO YYYY-MM-DD
}

/**
 * Returns today's date as YYYY-MM-DD in the given IANA timezone.
 * Uses Intl.DateTimeFormat for deterministic TZ-aware output on both
 * browser (uses system clock + tz) and Node.js.
 */
export function todayInTzDateString(tz: string): string {
  return civilDateInTz(new Date(), tz);
}

/**
 * Shifts a YYYY-MM-DD civil date by `delta` calendar days (negative to go back).
 *
 * Pure UTC string math on a civil date — no timezone involved, because a civil
 * date has no instant to shift. Calendar-correct across month, year and leap-day
 * boundaries.
 */
export function addCivilDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the current time as HH:mm in the given IANA timezone.
 */
export function currentTimeInTzHHmm(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return fmt.format(new Date()); // en-GB with hour12:false produces HH:mm
}

/**
 * Returns true when the START of a time slot/window (HH:mm-HH:mm) has already
 * passed in the given timezone — but ONLY for today's date.
 * For any other date always returns false (future dates are never in the past).
 */
export function isTimeStartInPastForDate(slotOrWindow: string, referenceDate: string, tz: string): boolean {
  if (referenceDate !== todayInTzDateString(tz)) return false;
  const start = slotOrWindow.split('-')[0];
  if (!start) return false;
  return start < currentTimeInTzHHmm(tz);
}
