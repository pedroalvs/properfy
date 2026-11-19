import type { GoalWithScope } from './goal.repository';

/**
 * The human scope label snapshotted onto closures and awards (L-F08-13): the
 * region name for region-volume goals, the service-type name for service-type
 * goals, the inspector name when the goal is scoped to one inspector, else null.
 * A deleted region surfaces as null (the daily job and reactivation both fall back
 * to "in a deleted region" copy downstream).
 *
 * NOTE: `close-goal-periods.use-case.ts` and `inspector-program-standing.service.ts`
 * each carry a private copy of this logic (Pilar's core). They can fold into this
 * canonical helper when those files are next touched.
 */
export function scopeLabelFor(goal: GoalWithScope): string | null {
  if (goal.metric === 'REGION_VOLUME') return goal.scope.regionName;
  if (goal.metric === 'SERVICE_TYPE_VOLUME') return goal.scope.serviceTypeName;
  if (goal.scopeInspectorId !== null) return goal.scope.inspectorName;
  return null;
}
