/**
 * Appointment state-machine transition matrix — single source of truth
 * shared between backend (early-rejection in bulk use cases) and frontend
 * (footer-gating in MapBulkActionModal). Mirrors the official table in
 * `CLAUDE.md §5`. When the table changes, change this file and BOTH
 * consumers re-import the new shape — no duplication, no drift.
 *
 * The matrix only covers transitions reachable from the MAP bulk modal.
 * System-driven flows (e.g. AWAITING_INSPECTOR → SCHEDULED via inspector
 * accept, SCHEDULED → DONE via inspector execution) are NOT here — they
 * happen outside the operator's bulk surface.
 */

import { AppointmentStatus, type UserRole } from '../enums';

export interface ClUserFlags {
  cancel_appointments?: boolean;
  reject_appointments?: boolean;
  reschedule_appointments?: boolean;
}

interface TransitionEntry {
  target: AppointmentStatus;
  allowedRoles: UserRole[];
  /**
   * When set, CL_USER may also perform this transition if the listed
   * flag is enabled on their permissions config (per `CL_USER_PERMISSIONS`
   * in `user.ts`).
   */
  clUserFlag?: keyof ClUserFlags;
  reasonRequired: boolean;
}

const BASE_MATRIX: Record<AppointmentStatus, TransitionEntry[]> = {
  [AppointmentStatus.DRAFT]: [
    { target: AppointmentStatus.AWAITING_INSPECTOR, allowedRoles: ['OP'], reasonRequired: false },
    { target: AppointmentStatus.REJECTED, allowedRoles: ['OP', 'AM'], reasonRequired: true },
    {
      target: AppointmentStatus.CANCELLED,
      allowedRoles: ['OP', 'AM', 'CL_ADMIN'],
      clUserFlag: 'cancel_appointments',
      reasonRequired: true,
    },
  ],
  [AppointmentStatus.AWAITING_INSPECTOR]: [
    {
      target: AppointmentStatus.CANCELLED,
      allowedRoles: ['OP', 'AM', 'CL_ADMIN'],
      clUserFlag: 'cancel_appointments',
      reasonRequired: true,
    },
  ],
  [AppointmentStatus.SCHEDULED]: [
    {
      target: AppointmentStatus.CANCELLED,
      allowedRoles: ['OP', 'AM', 'CL_ADMIN'],
      clUserFlag: 'cancel_appointments',
      reasonRequired: true,
    },
    { target: AppointmentStatus.REJECTED, allowedRoles: ['OP', 'AM'], reasonRequired: true },
  ],
  [AppointmentStatus.DONE]: [
    // Reopen — AM only per CLAUDE.md §5.
    { target: AppointmentStatus.DRAFT, allowedRoles: ['AM'], reasonRequired: true },
  ],
  [AppointmentStatus.CANCELLED]: [
    { target: AppointmentStatus.DRAFT, allowedRoles: ['OP', 'AM'], reasonRequired: true },
  ],
  [AppointmentStatus.REJECTED]: [
    { target: AppointmentStatus.DRAFT, allowedRoles: ['OP', 'AM'], reasonRequired: true },
    // System-triggered when a REJECTED appointment is added to a service group.
    { target: AppointmentStatus.AWAITING_INSPECTOR, allowedRoles: ['OP', 'AM'], reasonRequired: true },
  ],
};

/**
 * Returns the set of target statuses an actor can transition to from
 * `currentStatus`. The result is order-preserving (matrix order) so the
 * frontend can render the dropdown deterministically.
 */
export function getValidTransitions(
  currentStatus: AppointmentStatus,
  role: UserRole,
  clUserFlags?: ClUserFlags,
): AppointmentStatus[] {
  const entries = BASE_MATRIX[currentStatus] ?? [];
  return entries
    .filter((entry) => {
      if (entry.allowedRoles.includes(role)) return true;
      if (role === 'CL_USER' && entry.clUserFlag && clUserFlags?.[entry.clUserFlag]) return true;
      return false;
    })
    .map((entry) => entry.target);
}

/**
 * Returns true iff `currentStatus → targetStatus` requires a reason.
 * The matrix declares this independently of role — every actor allowed
 * to make the transition must supply the same reason text.
 */
export function isReasonRequired(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus,
): boolean {
  const entries = BASE_MATRIX[currentStatus] ?? [];
  return entries.find((entry) => entry.target === targetStatus)?.reasonRequired ?? false;
}

/**
 * Returns true iff the transition is reachable in the matrix (regardless
 * of role/flag gating). Backend `BulkStatusTransitionUseCase` uses this
 * as a coarse precheck before delegating to the full state-machine
 * authorization in `ExecuteStatusTransitionUseCase`.
 */
export function isTransitionDefined(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus,
): boolean {
  const entries = BASE_MATRIX[currentStatus] ?? [];
  return entries.some((entry) => entry.target === targetStatus);
}
