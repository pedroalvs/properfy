import { AppointmentStatus, VALID_TRANSITIONS } from '@properfy/shared';
import type { AppointmentTransition } from '../types';

const TRANSITION_META: Record<string, Omit<AppointmentTransition, 'targetStatus'>> = {
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
        // AWAITING_INSPECTOR only via service group creation — never a standalone UI action
        if (t === AppointmentStatus.AWAITING_INSPECTOR) return false;
        // → SCHEDULED is never a dropdown action: AWAITING_INSPECTOR → SCHEDULED is handled by
        // the Assign Inspector button; DRAFT → SCHEDULED is not a supported UI transition.
        if (
          (currentStatus === AppointmentStatus.AWAITING_INSPECTOR ||
            currentStatus === AppointmentStatus.DRAFT) &&
          t === AppointmentStatus.SCHEDULED
        )
          return false;
        // AM cannot directly mark SCHEDULED → DONE (inspector action via cross-check)
        if (currentStatus === AppointmentStatus.SCHEDULED && t === AppointmentStatus.DONE)
          return false;
        // SCHEDULED → REJECTED is allowed for AM (feedback round item 8 — US9)
        return true;
      });
    case 'OP':
      return targets.filter((t) => {
        // AWAITING_INSPECTOR only via service group creation — never a standalone UI action
        if (t === AppointmentStatus.AWAITING_INSPECTOR) return false;
        // → SCHEDULED is never a dropdown action: AWAITING_INSPECTOR → SCHEDULED is handled by
        // the Assign Inspector button; DRAFT → SCHEDULED is not a supported UI transition.
        if (
          (currentStatus === AppointmentStatus.AWAITING_INSPECTOR ||
            currentStatus === AppointmentStatus.DRAFT) &&
          t === AppointmentStatus.SCHEDULED
        )
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
