import {
  formatInstantTime,
  formatWallTimeRange,
  isNetworkError,
  type ApiError,
  type DayPlanResponse,
  type PreviewDayPlanOrderResponse,
} from '@properfy/shared';

/**
 * Pure mappers between the server reorder-preview response (F04 Plan B,
 * `etaSource: 'MATRIX'`) and the view the Route screen renders. No React, no API.
 * The optimizer is no longer run on the client — the server evaluates the order
 * and these helpers only shape its answer (delta, "~" ETAs, window messages).
 */

/** Why a preview is unavailable; drives the degraded copy. */
export type PreviewReason = 'OFFLINE' | 'STARTED' | 'RATE_LIMIT' | 'ERROR';
export type PreviewStatus = 'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE';

/** Normalized slice of one preview query, so the view builder stays pure/testable. */
export interface PreviewSlice {
  phase: 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';
  /** Last successful (or kept-previous) response, when any. */
  data: PreviewDayPlanOrderResponse | null;
  /** Set when `phase === 'ERROR'`. */
  reason: PreviewReason | null;
}

export interface ReorderPreviewView {
  status: PreviewStatus;
  reason: PreviewReason | null;
  /**
   * True when the server degraded to the straight-line stub for the draft or the
   * suggested baseline (`approximate: true`, e.g. Mapbox rate-limit / provider
   * error returned as 200). The numbers still render, flagged as estimates — the
   * same contract the GET path honours — never as authoritative MATRIX times.
   */
  approximate: boolean;
  /** Finish epoch-ms of the draft order (null unless READY with a finish). */
  finishMs: number | null;
  /** `round((draftFinish − suggestedFinish) / 60000)`; null when not derivable. */
  deltaMin: number | null;
  /** Driving seconds of the draft order (0 unless READY). */
  driveS: number;
  /** Per-stop service-start epoch-ms (rendered with "~"); may use kept-previous data. */
  etaByAppointmentId: Record<string, number>;
  violations: Array<{ appointmentId: string; lateS: number }>;
}

const EMPTY_VIEW: ReorderPreviewView = {
  status: 'IDLE',
  reason: null,
  approximate: false,
  finishMs: null,
  deltaMin: null,
  driveS: 0,
  etaByAppointmentId: {},
  violations: [],
};

/**
 * Classify a failed preview into the reason the view renders. Offline is decided
 * upstream from the connectivity flag, so a network error here maps to a generic
 * ERROR; a started day (422) and a 429 get their own copy.
 */
export function classifyPreviewReason(error: unknown): PreviewReason {
  const apiError = error as ApiError;
  if (isNetworkError(apiError)) return 'ERROR';
  if (apiError?.status === 429) return 'RATE_LIMIT';
  if (apiError?.code === 'DAY_PLAN_ALREADY_STARTED') return 'STARTED';
  return 'ERROR';
}

/** The short status line shown when a reorder preview cannot produce times. */
export function previewUnavailableMessage(reason: PreviewReason | null): string {
  switch (reason) {
    case 'OFFLINE':
      return 'Route times are unavailable offline.';
    case 'STARTED':
      return 'Live route times are unavailable once your day has started.';
    case 'RATE_LIMIT':
      return 'Route times are updating — try again in a moment.';
    default:
      return 'Route times are unavailable right now.';
  }
}

/** "+12 min vs. suggested" / "−5 min vs. suggested" / "Same finish time as suggested". */
export function formatDelta(deltaMin: number): string {
  if (deltaMin > 0) return `+${deltaMin} min vs. suggested`;
  if (deltaMin < 0) return `−${Math.abs(deltaMin)} min vs. suggested`;
  return 'Same finish time as suggested';
}

/** "55 min driving" from a driving total in seconds. */
export function formatDrivingTotal(driveS: number): string {
  return `${Math.round(driveS / 60)} min driving`;
}

/** A local ETA from an epoch-ms instant, prefixed with "~" (e.g. "~9:12 am"). */
export function formatLocalEta(finishMs: number | null | undefined, timezone: string): string {
  if (finishMs == null) return '';
  return `~${formatInstantTime(new Date(finishMs).toISOString(), timezone)}`;
}

/** `round((draftFinishMs − suggestedFinishMs) / 60000)`; null when either side is missing. */
export function computeDeltaMin(draftFinishMs: number | null, suggestedFinishMs: number | null): number | null {
  if (draftFinishMs === null || suggestedFinishMs === null) return null;
  return Math.round((draftFinishMs - suggestedFinishMs) / 60000);
}

/** Epoch-ms per stop from the preview response, skipping stops with a null ETA. */
export function etaByAppointmentId(response: PreviewDayPlanOrderResponse): Record<string, number> {
  const map: Record<string, number> = {};
  for (const stop of response.stops) {
    if (stop.eta !== null) map[stop.appointmentId] = Date.parse(stop.eta);
  }
  return map;
}

/**
 * One message per window violation, numbered by the stop's 1-based position in
 * the full displayed order (locked prefix + reorderable draft):
 * "Stop 4 would arrive after its window 10:00 am – 12:00 pm".
 */
export function toViolationMessages(
  plan: DayPlanResponse,
  displayOrder: readonly string[],
  violations: ReadonlyArray<{ appointmentId: string; lateS: number }>,
): Array<{ appointmentId: string; message: string }> {
  const stopById = new Map(plan.stops.map((s) => [s.appointmentId, s] as const));
  const positionById = new Map(displayOrder.map((id, i) => [id, i + 1] as const));
  return violations.map((violation) => {
    const stop = stopById.get(violation.appointmentId);
    const position = positionById.get(violation.appointmentId) ?? 0;
    const range = stop ? formatWallTimeRange(stop.windowStart, stop.windowEnd) : '';
    return { appointmentId: violation.appointmentId, message: `Stop ${position} would arrive after its window ${range}` };
  });
}

function finishMsOf(data: PreviewDayPlanOrderResponse | null): number | null {
  return data?.finishEta ? Date.parse(data.finishEta) : null;
}

/**
 * Fold the draft and (optional) suggested-order preview slices into the view the
 * Route screen renders. Offline and errors degrade to UNAVAILABLE with a reason
 * and no fabricated numbers; a finish shows as soon as the draft succeeds even if
 * the suggested baseline (and thus the delta) is still pending.
 */
export function buildReorderPreviewView(args: {
  online: boolean;
  draft: PreviewSlice;
  /** null when the draft order equals the aligned suggested order (`sameAsSuggested`). */
  suggested: PreviewSlice | null;
  sameAsSuggested: boolean;
}): ReorderPreviewView {
  const { online, draft, suggested, sameAsSuggested } = args;

  if (!online) return { ...EMPTY_VIEW, status: 'UNAVAILABLE', reason: 'OFFLINE' };

  if (draft.phase === 'ERROR') {
    return { ...EMPTY_VIEW, status: 'UNAVAILABLE', reason: draft.reason ?? 'ERROR' };
  }

  // Per-stop ETAs may come from kept-previous data even while re-fetching, since
  // they are explicitly approximate ("~"); the summary finish is gated on READY.
  const etas = draft.data ? etaByAppointmentId(draft.data) : {};

  if (draft.phase !== 'SUCCESS' || !draft.data) {
    return { ...EMPTY_VIEW, status: draft.phase === 'LOADING' ? 'LOADING' : 'IDLE', etaByAppointmentId: etas };
  }

  const draftFinishMs = finishMsOf(draft.data);
  const suggestedFinishMs = sameAsSuggested
    ? draftFinishMs
    : suggested && suggested.phase === 'SUCCESS'
      ? finishMsOf(suggested.data)
      : null;
  const deltaMin = sameAsSuggested
    ? draftFinishMs !== null
      ? 0
      : null
    : computeDeltaMin(draftFinishMs, suggestedFinishMs);

  const suggestedApproximate =
    !sameAsSuggested && suggested?.phase === 'SUCCESS' ? (suggested.data?.approximate ?? false) : false;

  return {
    status: 'READY',
    reason: null,
    approximate: draft.data.approximate || suggestedApproximate,
    finishMs: draftFinishMs,
    deltaMin,
    driveS: draft.data.totals.driveS,
    etaByAppointmentId: etas,
    violations: draft.data.violations,
  };
}
