import { PLATFORM_TIMEZONE, currentTimeInTzHHmm, todayInTzDateString } from '@properfy/shared';

function toMinutes(hhmm: string): number {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Whether the appointment's scheduled window has already ended in Sydney time:
 * a previous civil date, or today with the current time past `timeSlotEnd`.
 */
export function isPastScheduledEnd(scheduledDate: string, timeSlotEnd: string): boolean {
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  if (scheduledDate < today) return true;
  if (scheduledDate > today) return false;
  return toMinutes(currentTimeInTzHHmm(PLATFORM_TIMEZONE)) > toMinutes(timeSlotEnd);
}
