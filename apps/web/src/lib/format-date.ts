/**
 * Date/time display formatting for the web app.
 *
 * The formatters live in `@properfy/shared` so every surface — web, PWA, tenant
 * portal, and the emails/PDFs/reports the backend renders — produces identical
 * strings. They are re-exported here so consumers keep one import path
 * alongside `toLocalISODate`.
 *
 * Pick the one matching the KIND of value you hold; none of them guess:
 *
 *   formatCivilDate        a calendar day (`scheduledDate`, `periodEnd`,
 *                          `dateOfBirth`) — carries no timezone
 *   formatWallTime*        a local clock reading (`timeSlotStart`) — no timezone
 *   formatInstantDate      the day an instant falls on (`createdAt`,
 *                          `effectiveAt`) — resolved in the platform timezone
 *   formatInstantDateTime  an instant with its time of day
 *
 * Passing an instant to `formatCivilDate` reads its UTC day, which in Sydney is
 * the PREVIOUS day for roughly ten hours out of every day.
 */
export {
  formatCivilDate,
  formatWallTime,
  formatWallTimeRange,
  formatWallTimeWindow,
  formatInstantDate,
  formatInstantDateTime,
} from '@properfy/shared';

/**
 * A `Date` as `YYYY-MM-DD` in the browser's local timezone.
 *
 * NOT a display formatter — this builds the civil-date query params and
 * `<input type="date">` values the API expects.
 */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
