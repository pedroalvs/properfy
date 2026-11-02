import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayPlanResponse } from '@properfy/shared';
import { getExecutionState } from '@/features/execution/lib/indexeddb';
import { subscribeExecutionStateChange } from '@/features/execution/lib/execution-state-events';
import {
  alignOrder,
  evaluateDraft,
  getReorderableSets,
  moveDown as moveDownIds,
  moveItem,
  moveUp as moveUpIds,
  type DraftEvaluation,
} from '../lib/reorder-draft';

/** A stop started on THIS device (check-in in flight) counts as locked immediately. */
function isLocallyStarted(phase: string): boolean {
  return phase === 'IN_PROGRESS' || phase === 'FINISHING' || phase === 'SUBMITTING' || phase === 'DONE';
}

function useLocallyStartedStops(ids: string[]): ReadonlySet<string> {
  const [started, setStarted] = useState<ReadonlySet<string>>(() => new Set());
  const key = ids.join(',');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      Promise.all(ids.map(async (id) => [id, await getExecutionState(id)] as const))
        .then((entries) => {
          if (!active) return;
          setStarted(new Set(entries.filter(([, s]) => s != null && isLocallyStarted(s.phase)).map(([id]) => id)));
        })
        // IndexedDB can be unavailable (private mode, jsdom): treat as no local state.
        .catch(() => {
          if (active) setStarted(new Set());
        });
    };
    refresh();
    const unsub = ids.map((id) => subscribeExecutionStateChange(id, refresh));
    return () => {
      active = false;
      unsub.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return started;
}

export type ReorderNotice = 'VERSION_FROZEN' | 'SET_DISCARDED' | 'STALE' | null;

export interface ReorderDraft {
  /** Reorderable stop ids in the current (draft or saved) order. */
  order: string[];
  reorderableIds: string[];
  lockedIds: string[];
  /** Full display order: locked prefix then the reorderable order. */
  displayOrder: string[];
  canReorder: boolean;
  isDirty: boolean;
  /** A newer version arrived while dirty — Save is blocked until "Review". */
  frozen: boolean;
  /** The plan is recomputing on the server — Save is blocked until it settles. */
  stale: boolean;
  /** Version the draft is based on (sent as `basedOnVersion`). */
  baseVersion: number;
  evaluation: DraftEvaluation | null;
  notice: ReorderNotice;
  moveTo: (from: number, to: number) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  resetToSuggested: () => void;
  discard: () => void;
  /** Discard the draft and adopt the newer version (the "Review" action). */
  review: () => void;
  clear: () => void;
}

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Owns the local reorder draft for the Route screen: the current order, its
 * live evaluation (ETAs, delta, violations — all local, no API), and the rules
 * that keep it safe when the plan changes underneath the inspector. A newer
 * version freezes a dirty draft (Review to adopt); a changed reorderable set
 * discards it; STALE blocks Save. The reorderable set is derived live (DB11),
 * including check-ins made on this device.
 */
export function useReorderDraft(plan: DayPlanResponse, stale: boolean): ReorderDraft {
  const locallyStarted = useLocallyStartedStops(plan.stops.map((s) => s.appointmentId));
  const { reorderableIds, lockedIds } = useMemo(
    () => getReorderableSets(plan, locallyStarted),
    [plan, locallyStarted],
  );

  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [notice, setNotice] = useState<ReorderNotice>(null);
  /** Plan version captured when the draft first became dirty — sent as `basedOnVersion`. */
  const dirtyBaseVersionRef = useRef(plan.version);

  const prevVersionRef = useRef(plan.version);

  const order = draftOrder ?? reorderableIds;
  const isDirty = draftOrder !== null && !sameOrder(draftOrder, reorderableIds);

  // Reconcile the draft with a changed plan (refetch / version bump / set change).
  useEffect(() => {
    const versionChanged = prevVersionRef.current !== plan.version;

    if (draftOrder !== null) {
      const setReallyChanged = !sameOrder([...draftOrder].sort(), [...reorderableIds].sort());
      if (setReallyChanged) {
        // A stop left (or joined) the reorderable set: the draft is meaningless now.
        setDraftOrder(null);
        setFrozen(false);
        setNotice('SET_DISCARDED');
      } else if (versionChanged && isDirty) {
        setFrozen(true);
        setNotice('VERSION_FROZEN');
      }
    }

    prevVersionRef.current = plan.version;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.version, reorderableIds]);

  useEffect(() => {
    if (stale) setNotice((n) => n ?? 'STALE');
    else setNotice((n) => (n === 'STALE' ? null : n));
  }, [stale]);

  const displayOrder = useMemo(() => [...lockedIds, ...order], [lockedIds, order]);

  const evaluation = useMemo(() => evaluateDraft(plan, order, new Date()), [plan, order]);
  const canReorder = evaluation !== null && reorderableIds.length >= 2;

  // A clean draft (equal to the saved order) is not a draft — keep `draftOrder`
  // null so the base version re-bases on a refetch (otherwise a move-and-undo
  // would pin `basedOnVersion` to a stale version and the next real Save 409s).
  const baseVersion = isDirty ? dirtyBaseVersionRef.current : plan.version;

  const startDraft = useCallback(
    (next: string[]) => {
      if (frozen) return;
      if (sameOrder(next, reorderableIds)) {
        setDraftOrder(null);
      } else {
        if (!isDirty) dirtyBaseVersionRef.current = plan.version; // capture at clean → dirty
        setDraftOrder(next);
      }
      setNotice(null);
    },
    [frozen, isDirty, reorderableIds, plan.version],
  );

  const moveTo = useCallback((from: number, to: number) => startDraft(moveItem(order, from, to)), [order, startDraft]);
  const moveUp = useCallback((id: string) => startDraft(moveUpIds(order, id)), [order, startDraft]);
  const moveDown = useCallback((id: string) => startDraft(moveDownIds(order, id)), [order, startDraft]);
  const resetToSuggested = useCallback(
    () => startDraft(alignOrder(plan.suggestedOrder, reorderableIds)),
    [plan.suggestedOrder, reorderableIds, startDraft],
  );

  const clear = useCallback(() => {
    setDraftOrder(null);
    setFrozen(false);
    setNotice(null);
  }, []);

  const discard = clear;
  const review = clear;

  return {
    order,
    reorderableIds,
    lockedIds,
    displayOrder,
    canReorder,
    isDirty,
    frozen,
    stale,
    baseVersion,
    evaluation,
    notice,
    moveTo,
    moveUp,
    moveDown,
    resetToSuggested,
    discard,
    review,
    clear,
  };
}
