import type { AppointmentStatus, TenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';

export interface InspectorAppointment {
  id: string;
  appointmentCode: string;
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
  observation: string | null;
  isOverdue?: boolean;
  agencyName?: string;
}

export interface InspectorScheduleDayResponse {
  date: string;
  appointments: Array<{
    id: string;
  }>;
}

export interface JobDetailsTenantContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  isPrimary: boolean;
}

export interface JobDetails {
  agency: { id: string; name: string };
  tenantContacts: JobDetailsTenantContact[];
  keys: { keyRequired: boolean; keyLocation: string | null };
  keyLocation?: { address: string; mapLinkUrl: string };
  propertyManager: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null;
  payment: {
    payoutAmount: number;
    currency: string;
  };
  inspectionAppLink?: {
    label: string;
    url: string;
  };
}

export interface InspectorAppointmentDetailResponse {
  data: {
    id: string;
    appointmentCode: string;
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
    observation: string | null;
    isOverdue?: boolean;
    agencyName?: string;
    jobDetails?: JobDetails;
  };
}

export interface DaySummary {
  date: string;
  count: number;
  label: string;
}
