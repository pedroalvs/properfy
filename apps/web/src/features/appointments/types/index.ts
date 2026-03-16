import type { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';

export type { AppointmentStatus } from '@properfy/shared';

export interface Appointment {
  id: string;
  code: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  propertyId: string;
  propertyAddress: string;
  serviceTypeId: string;
  serviceTypeName: string;
  status: AppointmentStatus;
  tenantConfirmationStatus: TenantConfirmationStatus;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  scheduledDate: string;
  timeSlot: string;
  keyRequired: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentFiltersState {
  search: string;
  status: string;
  branchId: string;
  startDate: string;
  endDate: string;
  showCancelled: boolean;
}

export interface AppointmentDetail extends Appointment {
  meetingLocation: string | null;
  keyLocation: string | null;
  cancellationReason: string | null;
}

export interface AppointmentTransition {
  targetStatus: AppointmentStatus;
  label: string;
  icon: string;
  variant: 'primary' | 'outlined' | 'danger' | 'warning';
  requiresReason: boolean;
}

export const DEFAULT_FILTERS: AppointmentFiltersState = {
  search: '',
  status: '',
  branchId: '',
  startDate: '',
  endDate: '',
  showCancelled: false,
};
