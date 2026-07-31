import {
  APPOINTMENT_STATUS_LABELS,
  AppointmentStatus,
  RentalTenantConfirmationStatus,
  ServiceGroupStatus,
  ServiceTypeFlowType,
} from '@properfy/shared';

export interface StatusStyle {
  bg: string;
  text: string;
  label: string;
}

/** Labels come from `@properfy/shared` so chips and API error messages agree. */
export const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, StatusStyle> = {
  [AppointmentStatus.DRAFT]: {
    bg: 'var(--color-status-draft)',
    text: 'var(--color-text-primary)',
    label: APPOINTMENT_STATUS_LABELS.DRAFT,
  },
  [AppointmentStatus.AWAITING_INSPECTOR]: {
    bg: 'var(--color-status-awaiting-inspector)',
    text: 'var(--color-text-primary)',
    label: APPOINTMENT_STATUS_LABELS.AWAITING_INSPECTOR,
  },
  [AppointmentStatus.SCHEDULED]: {
    bg: 'var(--color-status-scheduled)',
    text: 'var(--color-text-primary)',
    label: APPOINTMENT_STATUS_LABELS.SCHEDULED,
  },
  [AppointmentStatus.DONE]: {
    bg: 'var(--color-status-done)',
    text: 'var(--color-text-primary)',
    label: APPOINTMENT_STATUS_LABELS.DONE,
  },
  [AppointmentStatus.CANCELLED]: {
    bg: 'var(--color-status-cancelled)',
    text: 'var(--color-text-primary)',
    label: APPOINTMENT_STATUS_LABELS.CANCELLED,
  },
  [AppointmentStatus.REJECTED]: {
    bg: 'var(--color-status-rejected)',
    text: 'var(--color-text-primary)',
    label: APPOINTMENT_STATUS_LABELS.REJECTED,
  },
};

export function getStatusStyle(status: AppointmentStatus): StatusStyle {
  return APPOINTMENT_STATUS_MAP[status];
}

export const RENTAL_TENANT_CONFIRMATION_STATUS_MAP: Record<RentalTenantConfirmationStatus, StatusStyle> = {
  [RentalTenantConfirmationStatus.PENDING]: {
    bg: 'var(--color-confirmation-pending)',
    text: 'var(--color-text-primary)',
    label: 'Pending',
  },
  [RentalTenantConfirmationStatus.CONFIRMED]: {
    bg: 'var(--color-confirmation-confirmed)',
    text: 'var(--color-text-primary)',
    label: 'Confirmed',
  },
  [RentalTenantConfirmationStatus.UNAVAILABLE]: {
    bg: 'var(--color-confirmation-unavailable)',
    text: 'var(--color-text-primary)',
    label: 'Unavailable',
  },
  [RentalTenantConfirmationStatus.NO_RESPONSE]: {
    bg: 'var(--color-confirmation-no-response)',
    text: 'var(--color-text-primary)',
    label: 'No Response',
  },
};

export const SERVICE_GROUP_STATUS_MAP: Record<ServiceGroupStatus, StatusStyle> = {
  [ServiceGroupStatus.DRAFT]: {
    bg: 'var(--color-sg-draft)',
    text: 'var(--color-text-primary)',
    label: 'Draft',
  },
  [ServiceGroupStatus.PUBLISHED]: {
    bg: 'var(--color-sg-published)',
    text: 'var(--color-text-primary)',
    label: 'Published',
  },
  [ServiceGroupStatus.ACCEPTED]: {
    bg: 'var(--color-sg-accepted)',
    text: 'var(--color-text-primary)',
    label: 'Accepted',
  },
  [ServiceGroupStatus.CANCELLED]: {
    bg: 'var(--color-sg-cancelled)',
    text: 'var(--color-text-primary)',
    label: 'Cancelled',
  },
  [ServiceGroupStatus.REJECTED]: {
    bg: 'var(--color-sg-cancelled)',
    text: 'var(--color-text-primary)',
    label: 'Rejected',
  },
};

export const FLOW_TYPE_MAP: Record<ServiceTypeFlowType, StatusStyle> = {
  [ServiceTypeFlowType.ROUTINE]: {
    bg: 'var(--color-flow-routine)',
    text: 'var(--color-text-primary)',
    label: 'Routine',
  },
  [ServiceTypeFlowType.INGOING]: {
    bg: 'var(--color-flow-ingoing)',
    text: 'var(--color-text-primary)',
    label: 'Ingoing',
  },
  [ServiceTypeFlowType.OUTGOING]: {
    bg: 'var(--color-flow-outgoing)',
    text: 'var(--color-text-primary)',
    label: 'Outgoing',
  },
};
