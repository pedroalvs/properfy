/**
 * Inspection Start Gate
 *
 * Decides whether an inspector may start an inspection, based only on the
 * scheduled civil date:
 *
 *   - Before the scheduled day  -> blocked
 *   - On the scheduled day      -> allowed, at any hour
 *   - After the scheduled day   -> allowed, with no upper bound
 *
 * There is deliberately no time-slot window. A job that was not executed inside
 * its slot is still a job the inspector has to do, and blocking it only left the
 * appointment visible-but-unexecutable until the 45-day overdue sweep cancelled
 * it. The time slot remains an expectation shown to the inspector, not a gate.
 *
 * The scheduled date is a civil date in the platform timezone (Sydney), so the
 * gate opens at Sydney midnight — which is a different UTC instant depending on
 * whether the date falls in AEDT (UTC+11) or AEST (UTC+10).
 */
import { formatCivilDate, PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';

export class InspectionStartGateService {
  isStartAllowed(scheduledDate: Date, now: Date): { allowed: boolean; reason?: string } {
    // `scheduledDate` is a @db.Date pinned to UTC midnight; take its civil date.
    const civilDate = scheduledDate.toISOString().slice(0, 10);
    const dayOpens = zonedWallTimeToUtc(civilDate, '00:00', PLATFORM_TIMEZONE);

    if (now.getTime() < dayOpens.getTime()) {
      // This reason reaches the inspector verbatim: it travels in the error
      // envelope's `message` and the PWA shows it in a snackbar
      // (ExecutionPage `catch` -> `err.message`). Name the calendar day, not a
      // UTC instant — the gate is a date gate, and `civilDate` is already the
      // Sydney civil date, so no timezone conversion is involved.
      return {
        allowed: false,
        reason: `Too early: this inspection can be started from ${formatCivilDate(civilDate)}`,
      };
    }

    return { allowed: true };
  }
}
