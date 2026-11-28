import type { ServiceGroupStatus } from '@properfy/shared';
import {
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
 * the in-list rules, plus group-level rules (capacity /
 * group-not-terminal).
 *
 * The scheduled date is NOT a criterion: appointments joining a group
 * are re-scheduled to the group's date (see
 * `sync-appointment-time-slot-to-group.ts`), and the time window is
 * likewise adjusted, so neither blocks the add.
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
  | 'GROUP_IN_TERMINAL_STATE'
  | 'GROUP_CAPACITY_EXCEEDED'
  // Only reachable on the ACCEPTED path: the group's committed inspector is not
  // eligible (agency/region/service type) for the appointment being added, so
  // scheduling it under them would assign work they cannot serve.
  | 'INSPECTOR_INELIGIBLE';

export type AddToGroupValidation =
  | { ok: true }
  | { ok: false; reasonCode: AddToGroupReason };

/**
 * Reasons a MOVE between groups can fail. Shares the target-side reasons with the
 * add flow and adds the source-side ones that only a move can hit:
 * `NOT_GROUPED` (the appointment is not in any group — use add-to-group instead),
 * `SOURCE_GROUP_NOT_ACTIVE` (its current group is terminal/absent) and
 * `ALREADY_IN_TARGET` (it is already a member of the destination).
 */
export type MoveToGroupReason =
  | 'NOT_GROUPED'
  | 'SOURCE_GROUP_NOT_ACTIVE'
  | 'ALREADY_IN_TARGET'
  | 'INVALID_STATUS'
  | 'INVALID_SERVICE_TYPE'
  | 'GROUP_IN_TERMINAL_STATE'
  | 'GROUP_CAPACITY_EXCEEDED'
  | 'INSPECTOR_INELIGIBLE';

export type MoveToGroupValidation =
  | { ok: true }
  | { ok: false; reasonCode: MoveToGroupReason };

/** Statuses a live group member can hold (and therefore be moved from). */
const MOVABLE_MEMBER_STATUSES = new Set<string>(['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED']);

export interface GroupForValidation {
  status: ServiceGroupStatus;
  serviceTypeId: string;
  /** Used for the capacity check; passed in because callers may want to
   *  pre-add appointments hypothetically (eligibility preview). */
  currentSize: number;
}

export type AppointmentForAddValidation = AppointmentForValidation;

/**
 * Group statuses that still accept new members. ACCEPTED is included:
 * an inspector has committed, but members may still be added — the add
 * flow schedules the new appointment under that inspector (see
 * `add-appointments-to-group.use-case.ts`). CANCELLED/REJECTED are terminal.
 *
 * Exported so the repository's conditional link uses the same set rather
 * than restating it in SQL.
 */
export const ADDABLE_GROUP_STATUSES = new Set<ServiceGroupStatus>(['DRAFT', 'PUBLISHED', 'ACCEPTED']);

/**
 * Statuses into which an appointment may be *plain-linked* (set `service_group_id`
 * without scheduling) — the non-committed marketplace path. ACCEPTED is excluded on
 * purpose: a committed group must take new members through the atomic
 * link-and-schedule commit (`commitAppointmentToAcceptedGroup`), never a bare link,
 * or a concurrent accept mid-batch could leave an appointment linked to an ACCEPTED
 * group but still AWAITING_INSPECTOR and unscheduled. The `linkAppointments` SQL
 * guard uses this set so that race resolves to 0 rows instead of a stranded member.
 */
export const LINKABLE_GROUP_STATUSES = new Set<ServiceGroupStatus>(['DRAFT', 'PUBLISHED']);

/**
 * A group that will never run again. Membership of a terminal group is dead
 * weight: the marketplace only offers PUBLISHED groups, so an appointment linked
 * to one is invisible there and cannot be re-grouped (`canAddToGroup` rejects any
 * non-null link). Callers reviving an appointment must drop such a link.
 */
export const TERMINAL_GROUP_STATUSES = new Set<string>(['CANCELLED', 'REJECTED']);

export const isTerminalGroupStatus = (status: string): boolean =>
  TERMINAL_GROUP_STATUSES.has(status);

/**
 * Maximum number of appointments an existing group can hold. Enforced only when
 * *adding* appointments to a group (`canAddToGroup`); group creation is unbounded.
 */
const GROUP_CAPACITY_DEFAULT = 30;

export class ServiceGroupValidator {
  static validate(
    appointments: AppointmentForValidation[],
    expectedServiceTypeId: string,
  ): void {
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
    /**
     * Status of the group the appointment is *currently* linked to, when it has
     * one. Supplying it lets a dead link be replaced instead of blocking the
     * appointment forever — see the `ALREADY_GROUPED` check below. Omitted means
     * "unknown", which keeps the conservative behaviour of refusing any link.
     */
    currentGroupStatus?: string | null,
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
    // A link to a group that will never run again is dead weight, not ownership:
    // the marketplace only offers PUBLISHED groups, so refusing to replace such a
    // link is what strands the appointment — it cannot be released usefully and
    // cannot be re-grouped. The empty-group cleanup cancels without unlinking, so
    // these links exist. Replacing one is the repair, so allow it.
    if (appointment.serviceGroupId !== null) {
      const currentLinkIsDead =
        currentGroupStatus === null || (currentGroupStatus !== undefined && isTerminalGroupStatus(currentGroupStatus));
      if (!currentLinkIsDead) {
        return { ok: false, reasonCode: 'ALREADY_GROUPED' };
      }
    }
    // Date and time window are intentionally not checked — the appointment's
    // schedule is synced to the group's on join.
    return { ok: true };
  }

  /**
   * Predicate for the move-between-groups flow. Unlike `canAddToGroup`, it requires
   * the appointment to ALREADY be in a live (non-terminal) group — a move relinks an
   * existing member, it does not add a loose one (that is the add flow). The target
   * checks (addable / capacity / service type) mirror `canAddToGroup`;
   * `INSPECTOR_INELIGIBLE` is enforced by the use case (ACCEPTED target), not here.
   *
   * `sourceGroupStatus` is the status of the appointment's current group (null when
   * unknown/absent). The date/cutoff eligibility of the target is enforced in the use
   * case, since it depends on `now`.
   */
  static canMoveToGroup(
    appointment: AppointmentForAddValidation,
    targetGroup: GroupForValidation,
    targetGroupId: string,
    sourceGroupStatus: string | null,
  ): MoveToGroupValidation {
    if (!ADDABLE_GROUP_STATUSES.has(targetGroup.status)) {
      return { ok: false, reasonCode: 'GROUP_IN_TERMINAL_STATE' };
    }
    if (targetGroup.currentSize >= GROUP_CAPACITY_DEFAULT) {
      return { ok: false, reasonCode: 'GROUP_CAPACITY_EXCEEDED' };
    }
    if (appointment.serviceTypeId !== targetGroup.serviceTypeId) {
      return { ok: false, reasonCode: 'INVALID_SERVICE_TYPE' };
    }
    if (!MOVABLE_MEMBER_STATUSES.has(appointment.status)) {
      return { ok: false, reasonCode: 'INVALID_STATUS' };
    }
    if (appointment.serviceGroupId === null) {
      return { ok: false, reasonCode: 'NOT_GROUPED' };
    }
    if (appointment.serviceGroupId === targetGroupId) {
      return { ok: false, reasonCode: 'ALREADY_IN_TARGET' };
    }
    // The source must be a live group — a terminal/absent link is dead weight the
    // add flow repairs, not a move.
    if (sourceGroupStatus === null || isTerminalGroupStatus(sourceGroupStatus)) {
      return { ok: false, reasonCode: 'SOURCE_GROUP_NOT_ACTIVE' };
    }
    return { ok: true };
  }

  /** Convenience helper used by route layer to short-circuit when the
   *  group itself can't accept any new members (terminal state). */
  static isAddableStatus(status: ServiceGroupStatus): boolean {
    return ADDABLE_GROUP_STATUSES.has(status);
  }
}
