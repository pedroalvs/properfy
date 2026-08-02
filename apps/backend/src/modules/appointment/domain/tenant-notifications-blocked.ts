import { TENANT_NOTIFICATIONS_BLOCKED_CODE } from '@properfy/shared';

/**
 * True when the error is `GeneratePortalTokenUseCase`'s refusal to contact a rental tenant
 * whose agency has opted out.
 *
 * Duck-typed on `code` rather than `instanceof ConflictError`: the same class also carries
 * INVALID_APPOINTMENT_STATUS and other genuine conflicts, which must keep surfacing as
 * per-item errors.
 *
 * Shared by every batch caller. A blocked agency is a deliberate setting, not a failure —
 * and a selection or a cross-agency service group can legitimately mix blocked and
 * unblocked rows — so each caller maps it to its own status instead of ERROR. Both callers
 * also reach it through a race: the flag can be flipped between the repository snapshot
 * and the token being minted.
 */
export function isTenantNotificationsBlockedError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: unknown }).code === TENANT_NOTIFICATIONS_BLOCKED_CODE
  );
}
