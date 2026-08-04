import { ServiceTypeFlowType } from '../enums/service-type';
import { getTemplateTarget } from '../constants/notification-templates';

/** Recorded on a notification suppressed because its service type has no occupant. */
export const FLOW_TYPE_NO_OCCUPANT_CODE = 'FLOW_TYPE_NO_OCCUPANT';

/**
 * Flow types that never involve a rental tenant. `SCHEDULED` is already the
 * operational confirmation for these (see apps/backend/CLAUDE.md §8), so there
 * is nobody to notify, confirm with, remind or escalate about.
 *
 * An allowlist rather than `!== ROUTINE`: the two differ on every unrecognised
 * value, and silencing an occupant we *should* have contacted is the worse
 * failure. An unknown flow keeps notifying.
 */
const NON_NOTIFYING_FLOW_TYPES: ReadonlySet<string> = new Set([
  ServiceTypeFlowType.INGOING,
  ServiceTypeFlowType.OUTGOING,
]);

/**
 * Whether this service type's appointments have no occupant to notify.
 *
 * Fail-open on null/undefined/unknown: a bad or missing value must never
 * silence a routine inspection's occupant.
 */
export function suppressesOccupantNotifications(flowType: string | null | undefined): boolean {
  return flowType != null && NON_NOTIFYING_FLOW_TYPES.has(flowType);
}

/**
 * Whether this template must be withheld when the appointment's flow type has
 * no occupant.
 *
 * Occupant-directed templates come from `TEMPLATE_TARGETS`, so there is no
 * hand-maintained list to drift: a new template cannot enter either catalog
 * without declaring its target.
 *
 * `PROPERTY_MANAGER_ESCALATION` is the one addition. It is targeted at the
 * agency, not the occupant, but it exists solely to chase a rental tenant who
 * has not responded — meaningless when no response was ever expected. Its
 * same-target sibling `INSPECTION_CANCELLED_AGENCY` reports something that
 * really happened and must keep flowing, which is why this is keyed on the
 * specific code rather than on the target.
 */
export function isWithheldForNonNotifyingFlow(templateCode: string): boolean {
  return getTemplateTarget(templateCode) === 'RENTAL_TENANT'
    || templateCode === 'PROPERTY_MANAGER_ESCALATION';
}
