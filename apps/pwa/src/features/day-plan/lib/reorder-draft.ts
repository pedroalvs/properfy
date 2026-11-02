import {
  buildLegOverrides,
  formatInstantTime,
  formatWallTimeRange,
  toOptimizerInput,
  type DayPlanResponse,
  type DayPlanStop,
} from '@properfy/shared';
// Import the pure optimizer via the subpath so it stays out of the eager bundle
// (the barrel is imported app-wide; the subpath keeps route-planning in the lazy
// route chunk). `toOptimizerInput`/`buildLegOverrides` live in the zod-backed
// day-plan schema module, which the app already loads eagerly, so they come from
// the barrel.
import { evaluateSequence, RouteOrderMismatchError, type OptimizerInput } from '@properfy/shared/route-planning';

/**
 * Pure helpers for the local reorder draft — no React, no API. They reuse the
 * shared optimizer (`toOptimizerInput` + `buildLegOverrides` + `evaluateSequence`)
 * so the client's "+N min vs. suggested" preview is computed exactly as the
 * server would, and never reimplement that logic (L-F04-16 contract).
 */

/** A stop is reorderable only while not started — derived live (DB11). */
function isReorderable(stop: DayPlanStop, locallyInProgress: ReadonlySet<string>): boolean {
  return (
    stop.executionStatus === 'NOT_STARTED' &&
    !stop.executed &&
    !locallyInProgress.has(stop.appointmentId)
  );
}

/**
 * Split the plan's stops (in `sequence` order) into the reorderable ids
 * (not-yet-started) and the locked prefix (DONE / in progress / started on this
 * device). The reorderable set is derived live, never persisted.
 */
export function getReorderableSets(
  plan: DayPlanResponse,
  locallyInProgress: ReadonlySet<string> = new Set(),
): { reorderableIds: string[]; lockedIds: string[] } {
  const ordered = [...plan.stops].sort((a, b) => a.sequence - b.sequence);
  const reorderableIds: string[] = [];
  const lockedIds: string[] = [];
  for (const stop of ordered) {
    (isReorderable(stop, locallyInProgress) ? reorderableIds : lockedIds).push(stop.appointmentId);
  }
  return { reorderableIds, lockedIds };
}

/** Move the item at `from` to `to`, returning a new array (never mutates). */
export function moveItem<T>(order: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) {
    return [...order];
  }
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Move `id` up one position; no-op at the top. */
export function moveUp(order: readonly string[], id: string): string[] {
  const index = order.indexOf(id);
  return index <= 0 ? [...order] : moveItem(order, index, index - 1);
}

/** Move `id` down one position; no-op at the bottom. */
export function moveDown(order: readonly string[], id: string): string[] {
  const index = order.indexOf(id);
  return index < 0 || index >= order.length - 1 ? [...order] : moveItem(order, index, index + 1);
}

/**
 * Order the reorderable ids by their position in `preferred` (usually
 * `suggestedOrder`); any reorderable id missing from `preferred` keeps its
 * current relative order and goes to the end. Used by "Reset to suggested order".
 */
export function alignOrder(preferred: readonly string[], reorderableIds: readonly string[]): string[] {
  const rank = new Map(preferred.map((id, i) => [id, i] as const));
  const inPreferred = reorderableIds.filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const rest = reorderableIds.filter((id) => !rank.has(id));
  return [...inPreferred, ...rest];
}

/** The shared optimizer input for the plan, or `null` when reorder is impossible. */
export function getOptimizerInput(plan: DayPlanResponse, now: Date): OptimizerInput | null {
  return toOptimizerInput(plan, now);
}

/** True when the plan can be reordered locally (≥ 2 not-started stops with a location). */
export function canReorder(plan: DayPlanResponse, now: Date): boolean {
  return getOptimizerInput(plan, now) !== null;
}

export interface DraftEvaluation {
  /** Finish epoch-seconds of the draft order (null when nothing is evaluable). */
  finishS: number | null;
  /** `round((finish(new) − finish(suggested)) / 60)`; positive = later than suggested. */
  deltaFinishMin: number;
  totalTravelS: number;
  violations: Array<{ key: string; lateS: number }>;
  /** Local service-start epoch-seconds per stop key (rendered with "~"). */
  serviceStartByKey: Record<string, number>;
  /** The order did not match the optimizer keys — the UI must reload. */
  invalid: boolean;
}

const EMPTY_EVAL: DraftEvaluation = {
  finishS: null,
  deltaFinishMin: 0,
  totalTravelS: 0,
  violations: [],
  serviceStartByKey: {},
  invalid: true,
};

/**
 * Evaluate the draft `order` locally against the plan's matrix, and the aligned
 * `suggestedOrder`, with the same criterion (`legTravelS` for unchanged adjacent
 * pairs, the matrix for the rest). Returns `null` when the plan cannot be
 * reordered; sets `invalid` when the order does not match the optimizer keys.
 */
export function evaluateDraft(plan: DayPlanResponse, order: readonly string[], now: Date): DraftEvaluation | null {
  const input = getOptimizerInput(plan, now);
  if (!input) return null;
  const keys = input.stops.map((s) => s.key);
  const keySet = new Set(keys);
  const evalOrder = order.filter((id) => keySet.has(id));
  const suggested = alignOrder(plan.suggestedOrder, keys);

  try {
    const draftEval = evaluateSequence(input, evalOrder, {
      legTravelS: buildLegOverrides(evalOrder, plan.routingInput),
    });
    const suggestedEval = evaluateSequence(input, suggested, {
      legTravelS: buildLegOverrides(suggested, plan.routingInput),
    });
    const deltaFinishMin =
      draftEval.finishS !== null && suggestedEval.finishS !== null
        ? Math.round((draftEval.finishS - suggestedEval.finishS) / 60)
        : 0;
    const serviceStartByKey: Record<string, number> = {};
    for (const stop of draftEval.stops) serviceStartByKey[stop.key] = stop.serviceStartS;
    return {
      finishS: draftEval.finishS,
      deltaFinishMin,
      totalTravelS: draftEval.totalTravelS,
      violations: draftEval.violations,
      serviceStartByKey,
      invalid: false,
    };
  } catch (error) {
    if (error instanceof RouteOrderMismatchError) return { ...EMPTY_EVAL };
    throw error;
  }
}

/** "+12 min vs. suggested" / "−5 min vs. suggested" / "Same finish time as suggested". */
export function formatDelta(deltaFinishMin: number): string {
  if (deltaFinishMin > 0) return `+${deltaFinishMin} min vs. suggested`;
  if (deltaFinishMin < 0) return `−${Math.abs(deltaFinishMin)} min vs. suggested`;
  return 'Same finish time as suggested';
}

/** "55 min driving" from a travel total in seconds. */
export function formatDrivingTotal(totalTravelS: number): string {
  return `${Math.round(totalTravelS / 60)} min driving`;
}

/** A local ETA from an epoch-seconds service start, prefixed with "~" (e.g. "~9:12 am"). */
export function formatLocalEta(serviceStartS: number | undefined, timezone: string): string {
  if (serviceStartS === undefined) return '';
  return `~${formatInstantTime(new Date(serviceStartS * 1000).toISOString(), timezone)}`;
}

/**
 * One message per window violation, numbered by the stop's position in the full
 * displayed order (locked prefix + reorderable draft), counting from 1:
 * "Stop 4 would arrive after its window 10:00 am – 12:00 pm".
 */
export function toViolationMessages(
  plan: DayPlanResponse,
  displayOrder: readonly string[],
  violations: ReadonlyArray<{ key: string; lateS: number }>,
): Array<{ key: string; message: string }> {
  const stopById = new Map(plan.stops.map((s) => [s.appointmentId, s] as const));
  const positionById = new Map(displayOrder.map((id, i) => [id, i + 1] as const));
  return violations.map((violation) => {
    const stop = stopById.get(violation.key);
    const position = positionById.get(violation.key) ?? 0;
    const range = stop ? formatWallTimeRange(stop.windowStart, stop.windowEnd) : '';
    return { key: violation.key, message: `Stop ${position} would arrive after its window ${range}` };
  });
}
