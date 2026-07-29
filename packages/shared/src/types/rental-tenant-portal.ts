export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface AvailableSlot {
  dayOfWeek: DayOfWeek;
  start: string;
  end: string;
}

export interface AvailableGroup {
  groupId: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  suburb: string;
  inspectorName: string;
  /** Inspections already promised inside this window. */
  bookedCount: number;
  /** What the window holds under the 2-inspections-per-hour rule: duration x 2. */
  capacityMax: number;
}
