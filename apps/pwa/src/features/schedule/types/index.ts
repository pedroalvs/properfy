import type { AppointmentStatus, TenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';

export interface InspectorAppointment {
  id: string;
  propertyAddress: string;
  suburb: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  status: AppointmentStatus;
  tenantConfirmation: TenantConfirmationStatus;
  serviceTypeName: string;
  flowType: ServiceTypeFlowType;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  keyRequired: boolean;
  meetingLocation: string | null;
  restrictions: string | null;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  notes: string | null;
}

export interface DaySummary {
  date: string;
  count: number;
  label: string;
}
