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
