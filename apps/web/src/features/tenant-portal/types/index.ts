import type { AppointmentStatus, AvailableGroup, AvailableSlot, TenantConfirmationStatus } from '@properfy/shared';

export type { AvailableSlot };
export type { AvailableGroup } from '@properfy/shared';

export interface PortalTokenInfo {
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  isReadOnly: boolean;
}

export interface PortalAppointment {
  id: string;
  status: AppointmentStatus;
  scheduledDate: string;
  timeSlot: string;
  serviceTypeId?: string;
  serviceType?: {
    id: string;
    name: string;
    code: string;
  } | null;
  property?: {
    id: string;
    propertyCode: string;
    type: string;
    street: string;
    addressLine2: string | null;
    suburb: string;
    postcode: string;
    state: string;
    country: string;
  } | null;
  tenantConfirmationStatus: TenantConfirmationStatus;
  keyRequired: boolean;
  meetingLocation: string | null;
  notes: string | null;
}

export interface PortalContact {
  tenantName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
}

export interface PortalRestrictions {
  isHome: boolean | null;
  unavailableDaysJson: string[] | null;
  unavailableHoursJson: Array<{ start: string; end: string }> | null;
  availableSlotsJson?: AvailableSlot[] | null;
  notes: string | null;
  source: string;
}

export interface PortalExistingResponse {
  type: string;
  createdAt: string;
  summary?: string;
}

export interface PortalTenantInfo {
  name: string | null;
  timezone: string;
}

export interface PortalData {
  token: PortalTokenInfo;
  appointment: PortalAppointment;
  contact: PortalContact | null;
  restrictions: PortalRestrictions | null;
  existingResponse?: PortalExistingResponse;
  agencyPhone?: string;
  deadline?: string;
  rescheduleAllowed?: boolean;
  tenant?: PortalTenantInfo;
}

export interface ConfirmInput {
  restrictions?: {
    isHome?: boolean | null;
    unavailableDaysJson?: string[] | null;
    unavailableHoursJson?: Array<{ start: string; end: string }> | null;
    availableSlotsJson?: AvailableSlot[] | null;
    notes?: string | null;
  };
  tenantNote?: string;
}

export interface RescheduleInput {
  newDate: string;
  newTimeSlot: string;
  restrictions?: ConfirmInput['restrictions'];
  tenantNote?: string;
}

export interface UpdateContactInput {
  primaryEmail?: string;
  primaryPhone?: string;
}

export interface ReportUnavailabilityInput {
  restrictions?: {
    isHome?: boolean | null;
    unavailableDaysJson?: string[] | null;
    unavailableHoursJson?: Array<{ start: string; end: string }> | null;
    availableSlotsJson?: AvailableSlot[] | null;
    notes?: string | null;
  };
  tenantNote?: string;
}

export interface JoinGroupInput {
  groupId: string;
  tenantNote?: string;
}

export interface AvailableGroupsData {
  groups: AvailableGroup[];
}
