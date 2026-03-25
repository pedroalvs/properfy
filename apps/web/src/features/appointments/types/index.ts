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
  doneCheckedByUserId?: string | null;
  doneCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentFiltersState {
  search: string;
  status: string;
  tenantConfirmationStatus: string;
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

export interface AppointmentFormData {
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  scheduledDate: string;
  timeSlot: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  keyRequired: boolean;
  meetingLocation: string;
  keyLocation: string;
  notes: string;
}

export type AppointmentFormErrors = Partial<Record<keyof AppointmentFormData, string>>;

export const EMPTY_FORM_DATA: AppointmentFormData = {
  branchId: '',
  propertyId: '',
  serviceTypeId: '',
  scheduledDate: '',
  timeSlot: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  keyRequired: false,
  meetingLocation: '',
  keyLocation: '',
  notes: '',
};

export const DEFAULT_FILTERS: AppointmentFiltersState = {
  search: '',
  status: '',
  tenantConfirmationStatus: '',
  branchId: '',
  startDate: '',
  endDate: '',
  showCancelled: false,
};
