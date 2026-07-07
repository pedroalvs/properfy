export interface DateAdjustment {
  scheduledDate: Date;
  before: { scheduledDate: Date };
}

export function sameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

/**
 * Appointments always follow their group's scheduled date. Returns the
 * adjustment to apply when the appointment sits on a different calendar
 * day (UTC) than the group, or null when already in sync.
 */
export function getServiceGroupDateAdjustment(
  appointmentDate: Date,
  groupScheduledDate: Date,
): DateAdjustment | null {
  if (sameUtcDay(appointmentDate, groupScheduledDate)) {
    return null;
  }
  return {
    scheduledDate: groupScheduledDate,
    before: { scheduledDate: appointmentDate },
  };
}
