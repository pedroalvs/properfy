/**
 * Pure resolver for the group "Send portal link" eligibility rule.
 *
 * Decides, per appointment in a service group, what should happen to the tenant
 * confirmation portal link. It is the single source of truth shared by both the
 * read-only preview (`GetGroupPortalLinkPlanUseCase`) and the executing
 * (`SendGroupPortalLinksUseCase`) flows, so the dialog summary and the actual
 * dispatch always agree.
 *
 * Rule (user-locked):
 *   1. Only AWAITING_INSPECTOR / SCHEDULED appointments can receive a link
 *      (mirrors GeneratePortalTokenUseCase's status gate). Anything else is
 *      `SKIP_NOT_SENDABLE`.
 *   2. A CONFIRMED appointment is skipped ONLY when it is confirmed for the
 *      CURRENT date + time slot (its active cycle matches). The denormalized
 *      `tenant_confirmation_status` can be stale: an operator can edit an
 *      AWAITING_INSPECTOR appointment's date without resetting confirmation, so
 *      a CONFIRMED appointment whose active cycle no longer matches the current
 *      date/time is treated as `SEND_AFTER_RESET` (reset the cycle, then resend).
 *   3. Otherwise (not confirmed: PENDING / UNAVAILABLE / NO_RESPONSE, or never
 *      confirmed) the link is sent.
 */

export type PortalLinkPlannedAction =
  | 'SEND'
  | 'SEND_AFTER_RESET'
  | 'SKIP_ALREADY_CONFIRMED'
  | 'SKIP_NOT_SENDABLE';

export interface PortalLinkEligibilityInput {
  status: string;
  scheduledDate: Date;
  timeSlot: string | null;
  tenantConfirmationStatus: string;
  activeCycle: { scheduledDate: Date; timeSlot: string | null; status: string } | null;
}

// Mirrors GeneratePortalTokenUseCase ALLOWED_STATUSES — a portal link is only
// meaningful for a released, non-terminal appointment.
const SENDABLE_STATUSES = new Set(['AWAITING_INSPECTOR', 'SCHEDULED']);

// Date-only comparison, matching ConfirmationCycleService.createInitial which
// compares `scheduled_date` via the same YYYY-MM-DD slice.
function sameCalendarDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function classifyPortalLinkAction(input: PortalLinkEligibilityInput): PortalLinkPlannedAction {
  if (!SENDABLE_STATUSES.has(input.status)) {
    return 'SKIP_NOT_SENDABLE';
  }

  if (input.tenantConfirmationStatus === 'CONFIRMED') {
    const cycle = input.activeCycle;
    const confirmedForCurrent =
      cycle !== null &&
      sameCalendarDay(cycle.scheduledDate, input.scheduledDate) &&
      cycle.timeSlot === input.timeSlot;
    return confirmedForCurrent ? 'SKIP_ALREADY_CONFIRMED' : 'SEND_AFTER_RESET';
  }

  return 'SEND';
}
