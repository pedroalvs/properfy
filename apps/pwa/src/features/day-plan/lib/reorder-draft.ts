import type { DayPlanResponse, DayPlanStop } from '@properfy/shared';

/**
 * Pure helpers for the local reorder draft — no React, no API, no routing math.
 * They own the reorderable-set derivation and the order moves; the route
 * evaluation (ETAs, delta, violations) is done by the server preview under Plan B
 * (see `reorder-preview.ts` / `useReorderPreview`), never recomputed on the client.
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
 * current relative order and goes to the end. Used by "Reset to suggested order"
 * and to build the suggested baseline the preview delta compares against.
 */
export function alignOrder(preferred: readonly string[], reorderableIds: readonly string[]): string[] {
  const rank = new Map(preferred.map((id, i) => [id, i] as const));
  const inPreferred = reorderableIds.filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const rest = reorderableIds.filter((id) => !rank.has(id));
  return [...inPreferred, ...rest];
}

/**
 * True when the plan can be reordered: at least two not-started stops. Under Plan
 * B this no longer depends on `routingInput` — the server preview owns the matrix
 * (FR-012). Stops without coordinates still count (they are reorderable; the
 * preview simply omits their travel).
 */
export function canReorder(reorderableIds: readonly string[]): boolean {
  return reorderableIds.length >= 2;
}
