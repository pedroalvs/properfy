import { validateNewSchedule, ServiceGroupStatus } from '@properfy/shared';

export interface PublishBlockInput {
  status: ServiceGroupStatus;
  /** IANA timezone the schedule guard resolves "today" in. Service groups are
   *  validated server-side in the PLATFORM timezone (cross-tenant carve-out),
   *  so callers pass `PLATFORM_TIMEZONE` to match it exactly. */
  timeZone: string;
  /**
   * Number of appointments actually linked to the group. Pass an explicit count
   * (never `array?.length ?? 0`) so "the payload did not include appointments"
   * is not mistaken for "the group is empty".
   */
  appointmentCount: number;
  /**
   * `YYYY-MM-DD` or a full ISO datetime — only the civil date is read. The UTC
   * prefix is the right slice, not a Sydney conversion: the API serialises a
   * `@db.Date` column, which is pinned at UTC midnight, and the backend guard
   * reads it with the same `toISOString().slice(0, 10)`. Converting here would
   * introduce the client/server drift this helper exists to prevent.
   *
   * When absent the schedule check is skipped and the backend guard remains
   * the only line of defence, which is the safe direction to fail.
   */
  scheduledDate?: string | null;
  /** `HH:mm-HH:mm`. Omit when the caller does not have it. */
  timeWindow?: string | null;
  /**
   * Appointments that are not AWAITING_INSPECTOR. `label` is how the caller
   * identifies an appointment to the user (`#1001` on the detail page, the
   * appointment code on the map), since the two surfaces carry different
   * identifiers in their payloads.
   */
  blockingAppointments?: { label: string; status: string }[];
}

/**
 * Client-side mirror of the guards `PublishServiceGroupUseCase` enforces, so
 * the Publish button can explain itself instead of failing on submit. The date
 * rules come from the shared validator (Sydney "today", window start for
 * same-day groups), which is the same function the backend calls — the two can
 * therefore not drift.
 *
 * Returns the first blocking reason, or `null` when the group can be published.
 */
export function getPublishBlockReason(input: PublishBlockInput): string | null {
  // Publish is only ever offered for DRAFT groups; every other status is gated
  // by the caller, and evaluating them here would produce misleading copy.
  if (input.status !== ServiceGroupStatus.DRAFT) return null;

  if (input.appointmentCount === 0) {
    return 'Cannot publish: this group has no appointments. Add appointments before publishing.';
  }

  if (input.scheduledDate) {
    const schedule = validateNewSchedule({
      date: input.scheduledDate.slice(0, 10),
      // Without a window there is nothing to compare against the current time;
      // '23:59' makes the same-day branch a no-op and leaves the date check intact.
      timeSlot: input.timeWindow || '23:59',
      tz: input.timeZone,
    });
    if (!schedule.ok) {
      return schedule.code === 'TIME_IN_PAST'
        ? 'Cannot publish: the time window has already started today. Choose a later window.'
        : 'Cannot publish: the scheduled date is in the past. Update the group date before publishing.';
    }
  }

  const blocking = input.blockingAppointments ?? [];
  if (blocking.length > 0) {
    const list = blocking.map((a) => `${a.label} (${a.status})`).join(', ');
    return `Cannot publish: appointment${blocking.length > 1 ? 's' : ''} ${list} must be Awaiting Inspector`;
  }

  return null;
}
