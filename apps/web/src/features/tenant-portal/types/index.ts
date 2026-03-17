import type { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';

export interface PortalTokenInfo {
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  isReadOnly: boolean;
}

export interface PortalAppointment {
  id: string;
  status: AppointmentStatus;
  scheduledDate: string;
  timeSlot: string;
  serviceTypeId: string;
  tenantConfirmationStatus: TenantConfirmationStatus;
  keyRequired: boolean;
  meetingLocation: string | null;
  notes: string | null;
}

export interface PortalContact {
  tenantName: string;
  primaryEmail: string | null;
  secondaryEmail: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
}

export interface PortalRestrictions {
  isHome: boolean;
  unavailableDaysJson: string[] | null;
  unavailableHoursJson: string[] | null;
  notes: string | null;
  source: string;
}

export interface PortalData {
  token: PortalTokenInfo;
  appointment: PortalAppointment;
  contact: PortalContact | null;
  restrictions: PortalRestrictions | null;
}

export interface ConfirmInput {
  restrictions?: {
    isHome?: boolean | null;
    unavailableDaysJson?: string[] | null;
    unavailableHoursJson?: Array<{ start: string; end: string }> | null;
    notes?: string | null;
  };
}

export interface RescheduleInput {
  newDate: string;
  newTimeSlot: string;
  restrictions?: ConfirmInput['restrictions'];
}

export interface UpdateContactInput {
  primaryEmail?: string;
  secondaryEmail?: string | null;
  primaryPhone?: string;
  secondaryPhone?: string | null;
}

export interface ReportUnavailabilityInput {
  restrictions?: ConfirmInput['restrictions'];
}
