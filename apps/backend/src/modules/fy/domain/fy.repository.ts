// Read/write port for the Fy agent API. Queries are cross-tenant by design:
// the Fy bot serves rental tenants of every agency, like an OP operator.

export interface FyAppointmentRow {
  id: string;
  appointmentNumber: number;
  appointmentCodePrefix: string | null;
  status: string;
  scheduledDate: Date;
  timeSlotStart: string;
  timeSlotEnd: string;
  serviceTypeId: string;
  serviceTypeName: string;
  propertyAddress: string;
  tenantId: string;
  tenantName: string;
}

export interface FyContactMatch {
  contact: { name: string; email: string | null; phone: string | null };
  appointments: FyAppointmentRow[];
}

export interface FyAgency {
  id: string;
  name: string;
  timezone: string;
  branches: Array<{ id: string; name: string; email: string | null; address: string | null }>;
}

export interface IFyRepository {
  /**
   * Match by AU phone: stored snapshot/registry phones are not guaranteed
   * E.164, so matching compares digit-only forms against the given variants
   * (e.g. `61412345678` and `0412345678`).
   */
  findAppointmentsByContactPhone(params: {
    phoneDigitVariants: string[];
    statuses: string[];
    doneWithinHours: number;
  }): Promise<FyContactMatch | null>;
  findAgencyById(id: string): Promise<FyAgency | null>;
  /** Append to the appointment operational notes column. Returns false when the appointment does not exist. */
  appendAppointmentNote(appointmentId: string, line: string): Promise<boolean>;
}

export function formatAppointmentCode(prefix: string | null, appointmentNumber: number): string {
  return `${prefix ?? 'INS'}-${String(appointmentNumber).padStart(4, '0')}`;
}
