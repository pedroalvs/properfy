export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface AvailableSlot {
  dayOfWeek: DayOfWeek;
  start: string;
  end: string;
}

export interface AvailableGroup {
  id: string;
  scheduledDate: string;
  timeWindow: string;
  suburb: string;
  inspectorName: string;
  confirmedCount: number;
  capacityMax: number;
}
