/**
 * Inspection Time Window Service
 *
 * Validates whether an inspector can start an inspection based on the
 * scheduled date and time slot. The allowed window is:
 *   - Opens: scheduledStart - 30 minutes
 *   - Closes: scheduledEnd + 2 hours
 *
 * All date operations use UTC.
 */
export class InspectionTimeWindowService {
  private static readonly MINUTES_BEFORE = 30;
  private static readonly HOURS_AFTER = 2;

  isWithinWindow(
    scheduledDate: Date,
    timeSlot: string,
    now: Date,
  ): { allowed: boolean; reason?: string } {
    const [startTime, endTime] = timeSlot.split('-');
    if (!startTime || !endTime) {
      return { allowed: false, reason: 'Invalid time slot format' };
    }

    const scheduledStart = this.combineDateAndTime(scheduledDate, startTime);
    const scheduledEnd = this.combineDateAndTime(scheduledDate, endTime);

    const windowOpens = new Date(
      scheduledStart.getTime() - InspectionTimeWindowService.MINUTES_BEFORE * 60 * 1000,
    );
    const windowCloses = new Date(
      scheduledEnd.getTime() + InspectionTimeWindowService.HOURS_AFTER * 60 * 60 * 1000,
    );

    if (now.getTime() < windowOpens.getTime()) {
      return {
        allowed: false,
        reason: `Too early: inspection window opens at ${windowOpens.toISOString()}`,
      };
    }

    if (now.getTime() > windowCloses.getTime()) {
      return {
        allowed: false,
        reason: `Too late: inspection window closed at ${windowCloses.toISOString()}`,
      };
    }

    return { allowed: true };
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const parts = time.split(':').map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    const combined = new Date(date.getTime());
    combined.setUTCHours(hours, minutes, 0, 0);
    return combined;
  }
}
