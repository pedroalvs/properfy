import { useCreateMutation } from '@/hooks/useApiQuery';
import type { EligibilityCheckRequest, EligibilityCheckResponse } from '@properfy/shared';

/**
 * 026 §FR-510 — eligibility preview for the Add-to-group sub-modal.
 *
 * Modelled as a mutation rather than a query because:
 *  - The check is intent-driven: the modal opens, the operator picks a
 *    group, and only THEN the check fires. Caching across groups would
 *    be misleading (group state can change between checks).
 *  - The mutation pattern fits the per-button-click UX naturally and
 *    matches the existing `useBulk*` hooks from 025.
 *
 * The mutation's payload is `{ groupId, body: { appointmentIds } }`
 * so the same hook can target any group; callers expand the URL.
 */
export function useAppointmentsEligibilityCheck(groupId: string | null) {
  return useCreateMutation<EligibilityCheckRequest, EligibilityCheckResponse>(
    groupId ? `/v1/service-groups/${groupId}/eligibility-check` : '/v1/service-groups/__none__/eligibility-check',
    [], // no invalidation — read-only preview
  );
}
