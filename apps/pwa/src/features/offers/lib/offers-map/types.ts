export interface ExpandedGroupAppointment {
  /** Marker identity only — never rendered in the UI. */
  id: string;
  street: string;
  suburb: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  coordinates: { lat: number; lng: number } | null;
}

export interface ExpandedGroup {
  groupId: string;
  appointments: ExpandedGroupAppointment[];
}
