import { addCivilDays } from '@properfy/shared';

/** A `day-plan.publish` claim row (one per agency per local civil date). */
export interface PublishClaim {
  tenantId: string;
  /** The claimed civil date `YYYY-MM-DD`; the plan it enables is for `localDate + 1`. */
  localDate: string;
}

/**
 * A SCHEDULED, not-deleted appointment of an ACTIVE inspector under an ACTIVE
 * tenant. The caller filters inspector/tenant status; this layer only reasons
 * about claims and coverage.
 */
export interface PublishScheduledAppt {
  inspectorId: string;
  tenantId: string;
  /** Civil date `YYYY-MM-DD` = the plan date. */
  scheduledDate: string;
}

/** The current plan state for a `(inspector, date)` pair, for condition (c). */
export interface PublishPlanState {
  inspectorId: string;
  planDate: string;
  publishedAt: Date | null;
  notifiedAt: Date | null;
}

export interface DeriveDueInput {
  claims: PublishClaim[];
  scheduledAppts: PublishScheduledAppt[];
  plans: PublishPlanState[];
}

/** One `(inspector, plan date)` pair the publish job must process this run. */
export interface DueInspectorEntry {
  inspectorId: string;
  date: string;
}

/**
 * Derive the due set (§6 of TASK-F04-2). A pair `(inspector, plan_date)` is due when:
 * (a) the inspector has at least one SCHEDULED appointment on `plan_date`;
 * (b) EVERY active agency of those appointments has a `day-plan.publish` claim for
 *     `plan_date − 1` (otherwise the pair waits for the last agency);
 * (c) the plan is not already both published and notified.
 * Deterministic order: by `inspectorId`, then `date`.
 */
export function deriveDueInspectors(input: DeriveDueInput): DueInspectorEntry[] {
  const claimed = new Set(input.claims.map((c) => `${c.tenantId}|${c.localDate}`));

  // Group SCHEDULED appointments by (inspector, plan date), collecting agencies.
  const groups = new Map<string, { inspectorId: string; date: string; tenantIds: Set<string> }>();
  for (const appt of input.scheduledAppts) {
    const key = `${appt.inspectorId}|${appt.scheduledDate}`;
    let group = groups.get(key);
    if (!group) {
      group = { inspectorId: appt.inspectorId, date: appt.scheduledDate, tenantIds: new Set() };
      groups.set(key, group);
    }
    group.tenantIds.add(appt.tenantId);
  }

  const settled = new Set(
    input.plans.filter((p) => p.publishedAt !== null && p.notifiedAt !== null).map((p) => `${p.inspectorId}|${p.planDate}`),
  );

  const due: DueInspectorEntry[] = [];
  for (const group of groups.values()) {
    const claimDate = addCivilDays(group.date, -1);
    const allClaimed = [...group.tenantIds].every((t) => claimed.has(`${t}|${claimDate}`));
    if (!allClaimed) continue; // (a) + (b)
    if (settled.has(`${group.inspectorId}|${group.date}`)) continue; // (c)
    due.push({ inspectorId: group.inspectorId, date: group.date });
  }

  due.sort((a, b) => (a.inspectorId === b.inspectorId ? a.date.localeCompare(b.date) : a.inspectorId.localeCompare(b.inspectorId)));
  return due;
}
