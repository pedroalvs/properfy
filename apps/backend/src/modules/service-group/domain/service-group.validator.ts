import type { ServiceGroupExceptionType, ServiceGroupStatus } from '@properfy/shared';
import {
  GroupSizeTooSmallError,
  GroupSizeTooLargeError,
  AppointmentInvalidStatusError,
  AppointmentAlreadyInGroupError,
  ServiceTypeMismatchError,
} from './service-group.errors';

export interface AppointmentForValidation {
  id: string;
  appointmentNumber: number;
  status: string;
  serviceTypeId: string;
  tenantId: string;
  serviceGroupId: string | null;
}

/**
 * 026 §FR-510 — predicate variant of the validator used by the
 * add-to-group flow. Same invariants as the throw-style `validate` for
 * the in-list rules, plus group-level rules (tenant / date / timeWindow /
 * capacity / group-not-terminal).
 *
 * Returns `{ ok }` for use cases that surface per-item statuses in a
 * mixed-result envelope (eligibility check, bulk add) — exceptions
 * would force the route to either succeed-all-or-fail-all, which is
 * the wrong UX for the operator.
 *
 * `reasonCode` values are shared with the frontend; see
 * `eligibilityCheckResponseSchema` in `packages/shared/src/schemas/service-group.ts`.
 */
export type AddToGroupReason =
  | 'INVALID_STATUS'
  | 'ALREADY_GROUPED'
  | 'INVALID_SERVICE_TYPE'
  | 'INVALID_DATE'
  | 'INVALID_TIME_WINDOW'
  | 'GROUP_IN_TERMINAL_STATE'
  | 'GROUP_CAPACITY_EXCEEDED';

export type AddToGroupValidation =
  | { ok: true }
  | { ok: false; reasonCode: AddToGroupReason };

export interface GroupForValidation {
  status: ServiceGroupStatus;
  serviceTypeId: string;
  scheduledDate: Date;
  timeWindow: string;
  /** Used for the capacity check; passed in because callers may want to
   *  pre-add appointments hypothetically (eligibility preview). */
  currentSize: number;
}

export interface AppointmentForAddValidation extends AppointmentForValidation {
  scheduledDate: Date;
  timeSlot: string;
}

/**
 * Group statuses that still accept new members. ACCEPTED locks the
 * group (inspector committed); CANCELLED/REJECTED are terminal.
 */
const ADDABLE_GROUP_STATUSES = new Set<ServiceGroupStatus>(['DRAFT', 'PUBLISHED']);

function sameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

const GROUP_CAPACITY_DEFAULT = 30;

/**
 * Size limits that apply when a service group exception type is declared.
 * Without an exception: min=5, max=30.
 *
 * See: projeto-consolidado/service-group-exceptions.md for the full rationale
 * and migration path to automatic (Scenario 1) exceptions.
 */
const EXCEPTION_LIMITS: Record<ServiceGroupExceptionType, { min: number; max: number }> = {
  LOW_DENSITY_REGION: { min: 1, max: 30 },
  ISOLATED_SERVICE:   { min: 1, max: 3  },
  PRIORITY_CLIENT:    { min: 1, max: 8  },
};

const DEFAULT_LIMITS = { min: 5, max: 30 };

export class ServiceGroupValidator {
  static validate(
    appointments: AppointmentForValidation[],
    expectedServiceTypeId: string,
    exceptionType?: ServiceGroupExceptionType | null,
  ): void {
    const limits = exceptionType ? EXCEPTION_LIMITS[exceptionType] : DEFAULT_LIMITS;

    if (appointments.length < limits.min) {
      throw new GroupSizeTooSmallError(appointments.length);
    }
    if (appointments.length > limits.max) {
      throw new GroupSizeTooLargeError(appointments.length);
    }

    for (const appt of appointments) {
      // Groupable statuses: DRAFT and REJECTED auto-transition to AWAITING_INSPECTOR on group join.
      if (appt.status !== 'AWAITING_INSPECTOR' && appt.status !== 'DRAFT' && appt.status !== 'REJECTED') {
        throw new AppointmentInvalidStatusError(appt.appointmentNumber);
      }

      // Must not already be in a group
      if (appt.serviceGroupId !== null) {
        throw new AppointmentAlreadyInGroupError(appt.appointmentNumber);
      }

      // Must match the expected service type
      if (appt.serviceTypeId !== expectedServiceTypeId) {
        throw new ServiceTypeMismatchError();
      }
    }
  }

  /**
   * 026 §FR-510 — predicate variant for the add-to-group flow.
   *
   * Why not throw + catch? Throwing forces the route into an
   * all-or-nothing transaction; the mixed-result envelope needs to
   * report per-item failures while continuing the batch. Same
   * invariants as `validate` for the in-list rules plus the group's
   * own lifecycle and capacity.
   */
  static canAddToGroup(
    appointment: AppointmentForAddValidation,
    group: GroupForValidation,
  ): AddToGroupValidation {
    if (!ADDABLE_GROUP_STATUSES.has(group.status)) {
      return { ok: false, reasonCode: 'GROUP_IN_TERMINAL_STATE' };
    }
    if (group.currentSize >= GROUP_CAPACITY_DEFAULT) {
      return { ok: false, reasonCode: 'GROUP_CAPACITY_EXCEEDED' };
    }
    // Groups are tenant-agnostic — appointments of any agency may join.
    if (appointment.serviceTypeId !== group.serviceTypeId) {
      return { ok: false, reasonCode: 'INVALID_SERVICE_TYPE' };
    }
    if (appointment.status !== 'DRAFT' && appointment.status !== 'AWAITING_INSPECTOR' && appointment.status !== 'REJECTED') {
      return { ok: false, reasonCode: 'INVALID_STATUS' };
    }
    if (appointment.serviceGroupId !== null) {
      return { ok: false, reasonCode: 'ALREADY_GROUPED' };
    }
    if (!sameDay(appointment.scheduledDate, group.scheduledDate)) {
      return { ok: false, reasonCode: 'INVALID_DATE' };
    }
    if (appointment.timeSlot !== group.timeWindow) {
      return { ok: false, reasonCode: 'INVALID_TIME_WINDOW' };
    }
    return { ok: true };
  }

  /** Convenience helper used by route layer to short-circuit when the
   *  group itself can't accept any new members (terminal state). */
  static isAddableStatus(status: ServiceGroupStatus): boolean {
    return ADDABLE_GROUP_STATUSES.has(status);
  }
}
