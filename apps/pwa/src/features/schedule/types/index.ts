import type { z } from 'zod';
import type {
  AppointmentApp,
  AppointmentCustomField,
  AppointmentStatus,
  GeofenceMode,
  InspectorContactChannel,
  InspectorTenantContact,
  PropertyType,
  RentalTenantConfirmationStatus,
  ServiceTypeFlowType,
  inspectorScheduleMonthDaySchema,
  inspectorScheduleMonthItemSchema,
  inspectorScheduleMonthResponseSchema,
} from '@properfy/shared';

/** Geofence radius + mode the server applies at check-in (F03, TASK-F03-1). */
export interface InspectorGeofence {
  radiusMeters: number;
  mode: GeofenceMode;
}

/**
 * The requesting inspector's own last "Can't do this job" on this appointment
 * (F03, L-F03-09). `reason` is a plain string (not the enum) so a future reason
 * value from the server never breaks rendering.
 */
export interface InspectorLastFieldIssue {
  reason: string;
  note: string | null;
  occurredAt: string;
}

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
  /** Structured restrictions (detail endpoint only; empty elsewhere). */
  restrictionDetails?: AppointmentRestrictionDetail[];
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
  /** Note left by the rental tenant via the portal (detail endpoint only). */
  rentalTenantNote: string | null;
  observation: string | null;
  /** Operator-defined custom fields, read-only for the inspector (max 4). */
  customFields: AppointmentCustomField[];
  isOverdue?: boolean;
  agencyName?: string;
  /** App credentials linked to this appointment (live reference). */
  apps: AppointmentApp[];
  /** Geofence radius + mode in force (F03); drives the check-in distance warning. */
  geofence?: InspectorGeofence;
  /** The inspector's own last "Can't do this job" on this appointment (F03, L-F03-09). */
  lastFieldIssue?: InspectorLastFieldIssue | null;
  /**
   * Published-plan stop start (F04). Absent until F04 ships — the "Running late"
   * reference then falls back to `timeSlotStart`. Read defensively (optional).
   */
  publishedServiceStartAt?: string | null;
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

/** Shared contract types (single source of truth in packages/shared). */
export type ContactChannel = InspectorContactChannel;
export type JobDetailsTenantContact = InspectorTenantContact;

/** Structured scheduling restriction (rendered by RestrictionsSection). */
export interface AppointmentRestrictionDetail {
  isHome: boolean;
  unavailableDays: string[];
  unavailableHours: string[];
  notes: string | null;
}

export interface JobDetails {
  agency: { id: string; name: string; branchName?: string | null };
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
    rentalTenantNote: string | null;
    observation: string | null;
    customFields?: AppointmentCustomField[];
    restrictions?: Array<{
      isHome: boolean;
      unavailableDaysJson: unknown;
      unavailableHoursJson: unknown;
      notes: string | null;
    }>;
    isOverdue?: boolean;
    agencyName?: string;
    apps?: AppointmentApp[];
    jobDetails?: JobDetails;
    geofence?: InspectorGeofence;
    lastFieldIssue?: InspectorLastFieldIssue | null;
    publishedServiceStartAt?: string | null;
  };
}

export interface DaySummary {
  date: string;
  count: number;
  label: string;
}
