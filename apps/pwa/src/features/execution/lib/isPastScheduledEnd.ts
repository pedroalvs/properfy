import { currentTimeInTzHHmm, todayInTzDateString } from '@properfy/shared';

function toMinutes(hhmm: string): number {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Whether the appointment's scheduled window has already ended in the given
 * timezone (the inspector's effective timezone): a previous civil date, or
 * today with the current time past `timeSlotEnd`. Display/advisory only — the
 * authoritative gate is server-side in the appointment's agency timezone.
 */
export function isPastScheduledEnd(
  scheduledDate: string,
  timeSlotEnd: string,
  timeZone: string,
): boolean {
  const today = todayInTzDateString(timeZone);
  if (scheduledDate < today) return true;
  if (scheduledDate > today) return false;
  return toMinutes(currentTimeInTzHHmm(timeZone)) > toMinutes(timeSlotEnd);
}
