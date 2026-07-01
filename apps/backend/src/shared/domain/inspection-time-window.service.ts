/**
 * Inspection Time Window Service
 *
 * Validates whether an inspector can start an inspection based on the
 * scheduled date and time slot. The allowed window is configurable:
 *   - Opens: scheduledStart - beforeMinutes (default 30)
 *   - Closes: scheduledEnd + afterMinutes (default 30)
 *
 * Bounds are read from tenant settings (inspectionWindowBeforeMinutes,
 * inspectionWindowAfterMinutes). When not configured, falls back to
 * the defaults above.
 *
 * All date operations use UTC.
 */

export interface InspectionTimeWindowBounds {
  beforeMinutes: number;
  afterMinutes: number;
}

const DEFAULT_BOUNDS: InspectionTimeWindowBounds = {
  beforeMinutes: 30,
  afterMinutes: 30,
};

/** Strict 24h HH:mm — guards combineDateAndTime against Invalid Date / next-day rollover. */
const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class InspectionTimeWindowService {
  isWithinWindow(
    scheduledDate: Date,
    timeSlotStart: string,
    timeSlotEnd: string,
    now: Date,
    bounds?: Partial<InspectionTimeWindowBounds>,
  ): { allowed: boolean; reason?: string } {
    const { beforeMinutes, afterMinutes } = {
      ...DEFAULT_BOUNDS,
      ...bounds,
    };

    if (!HHMM_RE.test(timeSlotStart) || !HHMM_RE.test(timeSlotEnd) || timeSlotStart >= timeSlotEnd) {
      return { allowed: false, reason: 'Invalid time slot format' };
    }

    const scheduledStart = this.combineDateAndTime(scheduledDate, timeSlotStart);
    const scheduledEnd = this.combineDateAndTime(scheduledDate, timeSlotEnd);

    const windowOpens = new Date(
      scheduledStart.getTime() - beforeMinutes * 60 * 1000,
    );
    const windowCloses = new Date(
      scheduledEnd.getTime() + afterMinutes * 60 * 1000,
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
