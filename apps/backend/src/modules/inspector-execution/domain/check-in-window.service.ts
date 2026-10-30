import { zonedWallTimeToUtc } from '@properfy/shared';

export interface CheckInWindowInput {
  /** The effective instant of the check-in (device time when plausible, else server time). */
  effectiveAt: Date;
  /** Scheduled civil date YYYY-MM-DD, in the agency timezone. */
  scheduledDate: string;
  /** Slot bounds as bare HH:mm wall-clock in the agency timezone. */
  timeSlotStart: string;
  timeSlotEnd: string;
  toleranceMinutes: number;
  /** Agency IANA timezone. */
  timeZone: string;
}

/**
 * True when the effective check-in instant falls outside
 * [slotStart − tolerance, slotEnd + tolerance] evaluated in the agency timezone
 * on the scheduled civil date. Bounds are inclusive (a check-in exactly at the
 * edge is inside). A check-in on a later civil day is always out of window.
 */
export function isOutOfCheckInWindow(input: CheckInWindowInput): boolean {
  const { effectiveAt, scheduledDate, timeSlotStart, timeSlotEnd, toleranceMinutes, timeZone } = input;
  const toleranceMs = toleranceMinutes * 60_000;
  const startMs = zonedWallTimeToUtc(scheduledDate, timeSlotStart, timeZone).getTime() - toleranceMs;
  const endMs = zonedWallTimeToUtc(scheduledDate, timeSlotEnd, timeZone).getTime() + toleranceMs;
  const t = effectiveAt.getTime();
  return t < startMs || t > endMs;
}
