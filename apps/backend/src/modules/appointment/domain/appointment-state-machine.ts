import type { AppointmentStatus, UserRole } from '@properfy/shared';

export interface TransitionRule {
  from: AppointmentStatus;
  to: AppointmentStatus;
  allowedActors: UserRole[];
  requiresReason: boolean;
  requiresDoneCheckedBy: boolean;
}

export const TRANSITION_RULES: TransitionRule[] = [
  {
    from: 'DRAFT',
    to: 'AWAITING_INSPECTOR',
    allowedActors: ['AM', 'OP'],
    requiresReason: false,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'DRAFT',
    to: 'REJECTED',
    allowedActors: ['AM', 'OP'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'DRAFT',
    to: 'CANCELLED',
    allowedActors: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'AWAITING_INSPECTOR',
    to: 'SCHEDULED',
    allowedActors: ['AM', 'OP'],
    requiresReason: false,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'AWAITING_INSPECTOR',
    to: 'CANCELLED',
    allowedActors: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'AWAITING_INSPECTOR',
    to: 'REJECTED',
    allowedActors: ['AM', 'OP'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'SCHEDULED',
    to: 'DONE',
    allowedActors: ['AM', 'OP', 'INSP'],
    requiresReason: false,
    requiresDoneCheckedBy: true,
  },
  {
    from: 'SCHEDULED',
    to: 'CANCELLED',
    allowedActors: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'SCHEDULED',
    to: 'REJECTED',
    allowedActors: ['AM', 'OP'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'REJECTED',
    to: 'DRAFT',
    allowedActors: ['AM', 'OP'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'REJECTED',
    to: 'AWAITING_INSPECTOR',
    allowedActors: ['AM', 'OP'],
    requiresReason: false,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'CANCELLED',
    to: 'DRAFT',
    allowedActors: ['AM', 'OP'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'DONE',
    to: 'DRAFT',
    allowedActors: ['AM'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
  {
    from: 'DONE',
    to: 'REJECTED',
    allowedActors: ['AM'],
    requiresReason: true,
    requiresDoneCheckedBy: false,
  },
];

export class AppointmentStateMachine {
  getTransitionRule(from: AppointmentStatus, to: AppointmentStatus): TransitionRule | null {
    return TRANSITION_RULES.find((r) => r.from === from && r.to === to) ?? null;
  }

  validateTransition(
    currentStatus: AppointmentStatus,
    targetStatus: AppointmentStatus,
    actorRole: UserRole,
  ): { valid: boolean; rule: TransitionRule | null; error?: string } {
    const rule = this.getTransitionRule(currentStatus, targetStatus);
    if (!rule) {
      return {
        valid: false,
        rule: null,
        error: `Invalid transition from ${currentStatus} to ${targetStatus}`,
      };
    }
    if (!rule.allowedActors.includes(actorRole)) {
      return {
        valid: false,
        rule,
        error: `Role ${actorRole} is not permitted for transition ${currentStatus} → ${targetStatus}`,
      };
    }
    return { valid: true, rule };
  }
}
