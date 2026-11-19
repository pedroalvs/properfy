import type { GoalMetric } from '@properfy/shared';

/** What `resolveParticipants` reads from a goal. */
export interface ParticipantGoalInput {
  metric: GoalMetric;
  scopeServiceTypeId: string | null;
  scopeInspectorId: string | null;
}

/** What `resolveParticipants` reads from an inspector. */
export interface ParticipantInspector {
  id: string;
  status: string;
  deletedAt: Date | null;
  serviceTypeIds: string[];
}

/**
 * The inspectors that participate in a goal for a period (P3): active, not
 * deleted, filtered by the goal's scope. `regionInspectorIds` is the set of
 * inspectors linked to the goal's region (the caller resolves it from
 * `inspector_regions`); it is only consulted for `REGION_VOLUME`.
 */
export function resolveParticipants(
  goal: ParticipantGoalInput,
  inspectors: ParticipantInspector[],
  regionInspectorIds: ReadonlySet<string>,
): string[] {
  let pool = inspectors.filter((i) => i.status === 'ACTIVE' && i.deletedAt === null);

  if (goal.metric === 'REGION_VOLUME') {
    pool = pool.filter((i) => regionInspectorIds.has(i.id));
  } else if (goal.metric === 'SERVICE_TYPE_VOLUME') {
    pool = goal.scopeServiceTypeId
      ? pool.filter((i) => i.serviceTypeIds.includes(goal.scopeServiceTypeId!))
      : [];
  }

  if (goal.scopeInspectorId !== null) {
    pool = pool.filter((i) => i.id === goal.scopeInspectorId);
  }

  return pool.map((i) => i.id);
}
