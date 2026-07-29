/**
 * Date/time display formatting for the inspector app.
 *
 * The formatters live in `@properfy/shared` so the inspector, the agency web app
 * and the rental tenant read identical strings for the same appointment. They
 * are re-exported here so consumers keep one import path.
 *
 * Pick the one matching the KIND of value you hold; none of them guess:
 *
 *   formatCivilDate        a calendar day (`scheduledDate`, `periodStart`,
 *                          `serviceDate`) — carries no timezone
 *   formatWallTime*        a local clock reading (`timeSlotStart`) — no timezone
 *   formatInstantDate      the day an instant falls on (`effectiveAt`) —
 *                          resolved in the platform timezone
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
