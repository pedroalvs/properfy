import {
  AppointmentStatus,
  TenantConfirmationStatus,
  ServiceGroupStatus,
  ServiceTypeFlowType,
} from '@properfy/shared';

export interface StatusStyle {
  bg: string;
  text: string;
  label: string;
}

export const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, StatusStyle> = {
  [AppointmentStatus.DRAFT]: {
    bg: 'var(--color-status-draft)',
    text: 'var(--color-text-primary)',
    label: 'Draft',
  },
  [AppointmentStatus.AWAITING_INSPECTOR]: {
    bg: 'var(--color-status-awaiting-inspector)',
    text: 'var(--color-text-primary)',
    label: 'Awaiting Inspector',
  },
  [AppointmentStatus.SCHEDULED]: {
    bg: 'var(--color-status-scheduled)',
    text: 'var(--color-text-primary)',
    label: 'Scheduled',
  },
  [AppointmentStatus.DONE]: {
    bg: 'var(--color-status-done)',
    text: 'var(--color-text-primary)',
    label: 'Done',
  },
  [AppointmentStatus.CANCELLED]: {
    bg: 'var(--color-status-cancelled)',
    text: 'var(--color-text-primary)',
    label: 'Cancelled',
  },
  [AppointmentStatus.REJECTED]: {
    bg: 'var(--color-status-rejected)',
    text: 'var(--color-text-primary)',
    label: 'Rejected',
  },
};

export function getStatusStyle(status: AppointmentStatus): StatusStyle {
  return APPOINTMENT_STATUS_MAP[status];
}

export const TENANT_CONFIRMATION_STATUS_MAP: Record<TenantConfirmationStatus, StatusStyle> = {
  [TenantConfirmationStatus.PENDING]: {
    bg: 'var(--color-confirmation-pending)',
    text: 'var(--color-text-primary)',
    label: 'Pending',
  },
  [TenantConfirmationStatus.CONFIRMED]: {
    bg: 'var(--color-confirmation-confirmed)',
    text: 'var(--color-text-primary)',
    label: 'Confirmed',
  },
  [TenantConfirmationStatus.UNAVAILABLE]: {
    bg: 'var(--color-confirmation-unavailable)',
    text: 'var(--color-text-primary)',
    label: 'Unavailable',
  },
  [TenantConfirmationStatus.NO_RESPONSE]: {
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
