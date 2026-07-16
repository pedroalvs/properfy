/**
 * Returns today's date as YYYY-MM-DD in the given IANA timezone.
 * Uses Intl.DateTimeFormat for deterministic TZ-aware output on both
 * browser (uses system clock + tz) and Node.js.
 */
export function todayInTzDateString(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // en-CA produces ISO YYYY-MM-DD
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
