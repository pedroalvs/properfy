import { todayInTzDateString, isTimeStartInPastForDate } from './local-date';

export type DateValidationResult =
  | { ok: true }
  | { ok: false; code: 'DATE_IN_PAST' | 'TIME_IN_PAST' };

/**
 * Validates a new schedule (create flow): date must not be in the past and,
 * for today's date, the slot start time must not have passed.
 */
export function validateNewSchedule(input: {
  date: string;
  timeSlot: string;
  tz: string;
}): DateValidationResult {
  const today = todayInTzDateString(input.tz);
  if (input.date < today) return { ok: false, code: 'DATE_IN_PAST' };
  if (input.date === today && isTimeStartInPastForDate(input.timeSlot, input.date, input.tz)) {
    return { ok: false, code: 'TIME_IN_PAST' };
  }
  return { ok: true };
}

/**
 * Validates an edited schedule (update flow): only validates when date or
 * time actually changes. If neither changed, returns ok immediately.
 */
export function validateEditedSchedule(input: {
  existingDate: string;
  existingTimeSlot: string;
  newDate?: string;
  newTimeSlot?: string;
  tz: string;
}): DateValidationResult {
  const dateChanged = input.newDate !== undefined && input.newDate !== input.existingDate;
  const timeChanged = input.newTimeSlot !== undefined && input.newTimeSlot !== input.existingTimeSlot;
  if (!dateChanged && !timeChanged) return { ok: true };

  const today = todayInTzDateString(input.tz);
  const effectiveDate = input.newDate ?? input.existingDate;
  const effectiveTimeSlot = input.newTimeSlot ?? input.existingTimeSlot;

  if (effectiveDate < today) return { ok: false, code: 'DATE_IN_PAST' };
  if (effectiveDate === today && isTimeStartInPastForDate(effectiveTimeSlot, effectiveDate, input.tz)) {
    return { ok: false, code: 'TIME_IN_PAST' };
  }
  return { ok: true };
}
