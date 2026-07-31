import type { GroupPortalLinkPlannedAction } from '@properfy/shared';

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
 *   2. An appointment whose owning agency has `rentalTenantNotificationsEnabled:
 *      false` is `SKIP_TENANT_NOTIFICATIONS_BLOCKED` — the occupant is never
 *      contacted. Evaluated per appointment because service groups are
 *      cross-agency: one group routinely holds blocked and unblocked members.
 *   3. A CONFIRMED appointment is skipped ONLY when it is confirmed for the
 *      CURRENT date + time slot (its active cycle matches). The denormalized
 *      `rental_tenant_confirmation_status` can be stale: an operator can edit an
 *      AWAITING_INSPECTOR appointment's date without resetting confirmation, so
 *      a CONFIRMED appointment whose active cycle no longer matches the current
 *      date/time is treated as `SEND_AFTER_RESET` (reset the cycle, then resend).
 *   4. Otherwise (not confirmed: PENDING / UNAVAILABLE / NO_RESPONSE, or never
 *      confirmed) the link is sent.
 *
 * The rules are listed in EVALUATION order, which matters: the blocked check runs
 * before the confirmed check, so a blocked appointment is never classified
 * SEND_AFTER_RESET and never has a live confirmation cycle reset for a message the
 * occupant would not receive.
 */

// Derived from the shared contract rather than restated: the API returns this union
// verbatim, so a local copy could drift from what the schema will actually serialize.
export type PortalLinkPlannedAction = GroupPortalLinkPlannedAction;

export interface PortalLinkEligibilityInput {
  status: string;
  scheduledDate: Date;
  timeSlot: string | null;
  rentalTenantConfirmationStatus: string;
  activeCycle: { scheduledDate: Date; timeSlot: string | null; status: string } | null;
  /** Owning agency's occupant-contact switch. Absent/true means the link may be sent. */
  rentalTenantNotificationsEnabled: boolean;
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

  // Checked before the confirmation branch so a blocked appointment is never
  // classified SEND_AFTER_RESET — that would reset a live confirmation cycle to
  // chase a message the occupant is never going to receive.
  if (!input.rentalTenantNotificationsEnabled) {
    return 'SKIP_TENANT_NOTIFICATIONS_BLOCKED';
  }

  if (input.rentalTenantConfirmationStatus === 'CONFIRMED') {
    const cycle = input.activeCycle;
    const confirmedForCurrent =
      cycle !== null &&
      sameCalendarDay(cycle.scheduledDate, input.scheduledDate) &&
      cycle.timeSlot === input.timeSlot;
    return confirmedForCurrent ? 'SKIP_ALREADY_CONFIRMED' : 'SEND_AFTER_RESET';
  }

  return 'SEND';
}
