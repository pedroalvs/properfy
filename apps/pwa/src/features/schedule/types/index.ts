import type { AppointmentStatus, TenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';

export interface InspectorAppointment {
  id: string;
  propertyAddress: string;
  suburb: string;
  scheduledDate: string;
  timeSlot: string;
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
  isOverdue?: boolean;
}

export interface InspectorScheduleDayResponse {
  date: string;
  appointments: Array<{
    id: string;
  }>;
}

export interface InspectorAppointmentDetailResponse {
  data: {
    id: string;
    status: AppointmentStatus;
    scheduledDate: string;
    timeSlot: string;
    timeSlotStart: string;
    timeSlotEnd: string;
    propertyAddress: string;
    suburb: string;
    tenantConfirmation: TenantConfirmationStatus;
    serviceTypeName: string | null;
    flowType: ServiceTypeFlowType;
    tenantName: string;
    tenantPhone: string | null;
    tenantEmail: string | null;
    keyRequired: boolean;
    meetingLocation: string | null;
    restrictionsSummary: string | null;
    propertyLatitude: number | null;
    propertyLongitude: number | null;
    notes: string | null;
    isOverdue?: boolean;
  };
}

export interface DaySummary {
  date: string;
  count: number;
  label: string;
}
