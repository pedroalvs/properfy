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
  const appointmentStart = parseTime(appointment.timeSlotStart);
  const appointmentEnd = parseTime(appointment.timeSlotEnd);

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

  return [parseTime(start), parseTime(end)];
}

function parseTime(value: string): { value: string; minutes: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid time value: ${value}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time value: ${value}`);
  }

  return { value, minutes: hours * 60 + minutes };
}
