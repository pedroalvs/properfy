import { useMemo, useCallback } from 'react';
import {
  getValidTransitions,
  isReasonRequired as reasonRequiredForTransition,
  type AppointmentStatus,
  type UserRole,
  type ClUserFlags,
} from '@properfy/shared';

/** Minimal row shape the transition logic needs. */
interface SelectionRow {
  status: string;
}

export interface UseSelectionTransitionsResult {
  /**
   * Target statuses EVERY selected row can reach (the intersection across the
   * selection, in matrix order). Offering only common targets keeps the bulk
   * action honest — a menu option is never shown that part of the batch cannot
   * reach.
   */
  targets: AppointmentStatus[];
  /**
   * True iff **any** selected row requires a reason for `target`.
   *
   * WEB-9: the map flow previously decided this from `checkedAppointments[0]`
   * alone, so a mixed batch like `[DRAFT, REJECTED] → AWAITING_INSPECTOR` (only
   * REJECTED needs a reason) was judged on the first row and submitted without
   * one, then rejected server-side. The list flow already used `.some()`; this
   * is the single source of truth with the correct semantics.
   */
  isReasonRequired: (target: AppointmentStatus | '') => boolean;
}

/**
 * Shared bulk status-transition logic for the selection-driven modals
 * (`BulkEditModal`, `MapBulkActionModal`). Extracted from the two divergent
 * copies — see WEB-9.
 */
export function useSelectionTransitions(
  appointments: ReadonlyArray<SelectionRow>,
  role: UserRole | null | undefined,
  clUserFlags?: ClUserFlags,
): UseSelectionTransitionsResult {
  const targets = useMemo(() => {
    if (!role || appointments.length === 0) return [] as AppointmentStatus[];
    const perRow = appointments.map(
      (a) => new Set(getValidTransitions(a.status as AppointmentStatus, role, clUserFlags)),
    );
    return Array.from(perRow.reduce((acc, s) => new Set([...acc].filter((t) => s.has(t)))));
  }, [appointments, role, clUserFlags]);

  const isReasonRequired = useCallback(
    (target: AppointmentStatus | '') =>
      !!target &&
      appointments.some((a) => reasonRequiredForTransition(a.status as AppointmentStatus, target)),
    [appointments],
  );

  return { targets, isReasonRequired };
}
