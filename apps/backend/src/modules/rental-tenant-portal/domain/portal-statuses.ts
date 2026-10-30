import { SYSTEM_ONLY_REJECTION_CODES } from '@properfy/shared';

/**
 * Statuses in which the rental tenant portal offers nothing to act on at all.
 *
 * `REJECTED` is deliberately absent. A rejection is the *expected* outcome of a
 * portal decline, and the tenant must still be able to pick another available
 * time from the change-time picker afterwards — rejoining a group is what
 * revives the appointment. Shutting the portal down on `REJECTED` would make the
 * decline a dead end.
 *
 * `DRAFT` is here because a reopened appointment has no schedule to confirm; its
 * confirmation cycle (and therefore its token) is superseded on the way in.
 */
export const PORTAL_DEAD_STATUSES = ['DRAFT', 'DONE', 'CANCELLED'] as const;

/**
 * Statuses in which the "will you be home?" question no longer applies, so
 * neither confirming nor declining is meaningful.
 *
 * This is `PORTAL_DEAD_STATUSES` plus `REJECTED`: an already-rejected
 * appointment has no slot left to attend, so answering "Yes" would confirm
 * attendance for nothing and answering "No" would try to reject it twice.
 * Changing time is still allowed — that is the path that revives it.
 */
export const PORTAL_UNANSWERABLE_STATUSES = [...PORTAL_DEAD_STATUSES, 'REJECTED'] as const;

export function isPortalDeadStatus(status: string): boolean {
  return (PORTAL_DEAD_STATUSES as readonly string[]).includes(status);
}

export function isPortalUnanswerableStatus(status: string): boolean {
  return (PORTAL_UNANSWERABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether the rental tenant portal must NOT offer "change time" for this
 * appointment (F03, L-F03-01 / D20).
 *
 * This is every dead status PLUS a `REJECTED` appointment whose rejection code is
 * system-only (today just `INSPECTOR_UNABLE`): when the inspector reported "Can't
 * do this job", re-offering is the operation's call, not the tenant's — the
 * change-time picker would otherwise silently revive a job the inspector already
 * refused. A tenant-driven decline (`TENANT_DECLINED`) still lets the tenant pick
 * another time, so it is deliberately not blocked here.
 */
export function isPortalChangeTimeBlocked(input: {
  status: string;
  rejectionReasonCode: string | null;
}): boolean {
  if (isPortalDeadStatus(input.status)) return true;
  return (
    input.status === 'REJECTED' &&
    input.rejectionReasonCode !== null &&
    (SYSTEM_ONLY_REJECTION_CODES as readonly string[]).includes(input.rejectionReasonCode)
  );
}
