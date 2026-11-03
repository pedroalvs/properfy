import { useMemo } from 'react';
import type { DayPlanResponse } from '@properfy/shared';
import { alignOrder } from '../lib/reorder-draft';
import { buildReorderPreviewView, type ReorderPreviewView } from '../lib/reorder-preview';
import { usePreviewDayPlanOrder } from './usePreviewDayPlanOrder';
import type { ReorderDraft } from './useReorderDraft';

const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

interface Options {
  online: boolean;
  /** Route is not past and the plan is reorderable (≥ 2 not-started stops). */
  reorderEnabled: boolean;
}

/**
 * The server-backed evaluation of the current reorder draft (F04 Plan B). Previews
 * the draft order (debounced 400 ms) and, when it differs from the aligned
 * suggested order, the suggested order too (cached per plan version) so the
 * "+N min vs. suggested" delta is computed from two MATRIX finishes — the same
 * comparison the old local recompute made, now without the raw matrix on the client.
 * Degrades to UNAVAILABLE (offline / started day / rate-limited / error) without
 * fabricating numbers.
 */
export function useReorderPreview(
  date: string,
  plan: DayPlanResponse,
  draft: ReorderDraft,
  { online, reorderEnabled }: Options,
): ReorderPreviewView {
  const suggestedOrder = useMemo(
    () => alignOrder(plan.suggestedOrder, draft.reorderableIds),
    [plan.suggestedOrder, draft.reorderableIds],
  );
  const sameAsSuggested = sameOrder(draft.order, suggestedOrder);
  const enabled = reorderEnabled && online;

  const draftSlice = usePreviewDayPlanOrder(date, plan.version, draft.order, { enabled, debounceMs: 400 });
  const suggestedSlice = usePreviewDayPlanOrder(date, plan.version, suggestedOrder, {
    enabled: enabled && !sameAsSuggested,
    debounceMs: 0,
  });

  return useMemo(
    () =>
      buildReorderPreviewView({
        online,
        draft: draftSlice,
        suggested: sameAsSuggested ? null : suggestedSlice,
        sameAsSuggested,
      }),
    [online, draftSlice, suggestedSlice, sameAsSuggested],
  );
}
