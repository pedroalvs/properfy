import type { z } from 'zod';
import type {
  AppointmentApp,
  AppointmentCustomField,
  AppointmentStatus,
  PropertyType,
  RentalTenantConfirmationStatus,
  ServiceTypeFlowType,
  inspectorScheduleMonthDaySchema,
  inspectorScheduleMonthItemSchema,
  inspectorScheduleMonthResponseSchema,
} from '@properfy/shared';

export interface InspectorAppointment {
  id: string;
  appointmentCode: string;
  propertyAddress: string;
  suburb: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  status: AppointmentStatus;
  rentalTenantConfirmation: RentalTenantConfirmationStatus;
  serviceTypeName: string;
  flowType: ServiceTypeFlowType;
  rentalTenantName: string;
  rentalTenantPhone: string | null;
  rentalTenantEmail: string | null;
  keyRequired: boolean;
  meetingLocation: string | null;
  restrictions: string | null;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  /** Property detail attributes (nullable — legacy properties have no values). */
  propertyAddressLine2?: string | null;
  propertyType?: PropertyType | null;
  propertyPrivateAreaM2?: number | null;
  propertyTotalAreaM2?: number | null;
  propertyFurnished?: boolean | null;
  propertyLinenProvided?: boolean | null;
  notes: string | null;
  observation: string | null;
  /** Operator-defined custom fields, read-only for the inspector (max 4). */
  customFields: AppointmentCustomField[];
  isOverdue?: boolean;
  agencyName?: string;
  /** App credentials linked to this appointment (live reference). */
  apps: AppointmentApp[];
}

export interface InspectorScheduleDayResponse {
  date: string;
  appointments: Array<{
    id: string;
  }>;
}

export type InspectorScheduleMonthDay = z.infer<typeof inspectorScheduleMonthDaySchema>;
export type InspectorScheduleMonthItem = z.infer<typeof inspectorScheduleMonthItemSchema>;
export type InspectorScheduleMonthResponse = z.infer<typeof inspectorScheduleMonthResponseSchema>;

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
    timeSlotStart: string;
    timeSlotEnd: string;
    propertyAddress: string;
    suburb: string;
    rentalTenantConfirmation: RentalTenantConfirmationStatus;
    serviceTypeName: string | null;
    flowType: ServiceTypeFlowType;
    rentalTenantName: string;
    rentalTenantPhone: string | null;
    rentalTenantEmail: string | null;
    keyRequired: boolean;
    meetingLocation: string | null;
    restrictionsSummary: string | null;
    propertyLatitude: number | null;
    propertyLongitude: number | null;
    propertyAddressLine2?: string | null;
    propertyType?: PropertyType | null;
    propertyPrivateAreaM2?: number | null;
    propertyTotalAreaM2?: number | null;
    propertyFurnished?: boolean | null;
    propertyLinenProvided?: boolean | null;
    notes: string | null;
    observation: string | null;
    customFields?: AppointmentCustomField[];
    isOverdue?: boolean;
    agencyName?: string;
    apps?: AppointmentApp[];
    jobDetails?: JobDetails;
  };
}

export interface DaySummary {
  date: string;
  count: number;
  label: string;
}
