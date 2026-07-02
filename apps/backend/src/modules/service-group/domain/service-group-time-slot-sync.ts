export interface AppointmentTimeSlot {
  timeSlotStart: string;
  timeSlotEnd: string;
}

export interface TimeSlotAdjustment extends AppointmentTimeSlot {
  before: AppointmentTimeSlot;
}

export function getServiceGroupTimeSlotAdjustment(
  appointment: AppointmentTimeSlot,
  groupTimeWindow: string,
): TimeSlotAdjustment | null {
  const [groupStart, groupEnd] = parseTimeWindow(groupTimeWindow);
  const appointmentStart = parseAppointmentTime(appointment.timeSlotStart);
  const appointmentEnd = parseAppointmentTime(appointment.timeSlotEnd);

  if (!appointmentStart || !appointmentEnd) {
    return null;
  }

  if (appointmentStart.minutes >= groupStart.minutes && appointmentEnd.minutes <= groupEnd.minutes) {
    return null;
  }

  return {
    timeSlotStart: groupStart.value,
    timeSlotEnd: groupEnd.value,
    before: {
      timeSlotStart: appointment.timeSlotStart,
      timeSlotEnd: appointment.timeSlotEnd,
    },
  };
}

function parseTimeWindow(timeWindow: string): [{ value: string; minutes: number }, { value: string; minutes: number }] {
  const [start, end] = timeWindow.split('-');
  if (!start || !end) {
    throw new Error(`Invalid service group time window: ${timeWindow}`);
  }

  return [parseGroupTime(start), parseGroupTime(end)];
}

function parseGroupTime(value: string): { value: string; minutes: number } {
  const parsed = parseAppointmentTime(value);
  if (!parsed) {
    throw new Error(`Invalid time value: ${value}`);
  }
  return parsed;
}

function parseAppointmentTime(value: string): { value: string; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return { value, minutes: hours * 60 + minutes };
}
