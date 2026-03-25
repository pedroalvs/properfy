import { AppointmentStatus, VALID_TRANSITIONS } from '@properfy/shared';
import type { AppointmentTransition } from '../types';

const TRANSITION_META: Record<string, Omit<AppointmentTransition, 'targetStatus'>> = {
  [AppointmentStatus.AWAITING_INSPECTOR]: {
    label: 'Release to Inspector',
    icon: 'mdi-account-search',
    variant: 'primary',
    requiresReason: false,
  },
  [AppointmentStatus.SCHEDULED]: {
    label: 'Schedule',
    icon: 'mdi-calendar-check',
    variant: 'primary',
    requiresReason: false,
  },
  [AppointmentStatus.DONE]: {
    label: 'Mark as Done',
    icon: 'mdi-check-circle',
    variant: 'primary',
    requiresReason: false,
  },
  [AppointmentStatus.CANCELLED]: {
    label: 'Cancel',
    icon: 'mdi-cancel',
    variant: 'danger',
    requiresReason: true,
  },
  [AppointmentStatus.REJECTED]: {
    label: 'Reject',
    icon: 'mdi-close-circle',
    variant: 'warning',
    requiresReason: true,
  },
  [`${AppointmentStatus.DRAFT}_reopen`]: {
    label: 'Reopen as Draft',
    icon: 'mdi-restart',
    variant: 'outlined',
    requiresReason: true,
  },
};

function isReopenTransition(currentStatus: AppointmentStatus, targetStatus: string): boolean {
  return (
    targetStatus === AppointmentStatus.DRAFT &&
    (currentStatus === AppointmentStatus.DONE ||
      currentStatus === AppointmentStatus.CANCELLED ||
      currentStatus === AppointmentStatus.REJECTED)
  );
}

function filterByRole(
  currentStatus: AppointmentStatus,
  targets: AppointmentStatus[],
  userRole: string,
): AppointmentStatus[] {
  switch (userRole) {
    case 'AM':
      return targets.filter((t) => {
        if (currentStatus === AppointmentStatus.DRAFT && t === AppointmentStatus.AWAITING_INSPECTOR)
          return false;
        if (
          currentStatus === AppointmentStatus.AWAITING_INSPECTOR &&
          t === AppointmentStatus.SCHEDULED
        )
          return false;
        if (currentStatus === AppointmentStatus.SCHEDULED && t === AppointmentStatus.DONE)
          return false;
        if (currentStatus === AppointmentStatus.SCHEDULED && t === AppointmentStatus.REJECTED)
          return false;
        return true;
      });
    case 'OP':
      return targets.filter((t) => {
        if (
          currentStatus === AppointmentStatus.AWAITING_INSPECTOR &&
          t === AppointmentStatus.SCHEDULED
        )
          return false;
        if (currentStatus === AppointmentStatus.SCHEDULED && t === AppointmentStatus.DONE)
          return false;
        if (currentStatus === AppointmentStatus.DONE && t === AppointmentStatus.DRAFT) return false;
        return true;
      });
    case 'CL_ADMIN':
    case 'CL_USER':
      return targets.filter((t) => t === AppointmentStatus.CANCELLED);
    case 'INSP':
      return targets.filter((t) => t === AppointmentStatus.DONE);
    default:
      return [];
  }
}

export function getAvailableTransitions(
  status: AppointmentStatus,
  userRole: string,
): AppointmentTransition[] {
  const allTargets = VALID_TRANSITIONS[status] ?? [];
  const filtered = filterByRole(status, allTargets, userRole);

  return filtered.map((targetStatus) => {
    const isReopen = isReopenTransition(status, targetStatus);
    const metaKey = isReopen ? `${AppointmentStatus.DRAFT}_reopen` : targetStatus;
    const meta = TRANSITION_META[metaKey]!;

    return {
      targetStatus,
      label: meta.label,
      icon: meta.icon,
      variant: meta.variant,
      requiresReason: meta.requiresReason,
    };
  });
}
