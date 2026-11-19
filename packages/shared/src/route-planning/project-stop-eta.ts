/**
 * Single ETA prediction module (F06-1, contract frozen for F05 and F06-2).
 *
 * Pure and deterministic: no `Date.now()`, no I/O. It projects each stop's
 * arrival/start/end from the last real field event plus the saved plan legs,
 * reusing F04's {@link evaluateSequence} so the inspector app, the tenant
 * notices and the Live Day dashboard never diverge. Departure rule is exactly
 * F04's: `earliestDepartureS = max(anchorEnd ?? now, now)`. The only extra rule
 * the tenant/F05 projection applies is the `LATE_NOTICE` floor (F06 D18),
 * because a late notice does not mark the plan STALE.
 *
 * All arithmetic is in integer epoch seconds (DST-safe: windows already arrive
 * as instants from F04; no "local hour + N" is ever computed here).
 */
import { evaluateSequence } from './evaluate-sequence';
import { DEFAULT_ROUTE_WEIGHTS, type OptimizerInput, type OptimizerStop } from './types';
// Type-only import: erased at build, so `route-planning` keeps no runtime
// dependency on the schema layer (and no import cycle).
import type { DayPlanResponse } from '../schemas/day-plan';

export interface EtaPlanStop {
  appointmentId: string;
  sequence: number;
  tenantId: string;
  /** civil date, agency wall-clock (YYYY-MM-DD) */
  scheduledDate: string;
  /** 'SCHEDULED' | 'DONE' | others (others are dropped) */
  appointmentStatus: string;
  /** day_plan_stops.travel_s — the arriving leg, in seconds */
  travelS: number;
  durationMinutes: number;
  windowStartAt: Date;
  windowEndAt: Date;
  windowTimezone: string;
  missingCoordinates: boolean;
  /** fresh plan start */
  serviceStartAt: Date | null;
  serviceEndAt: Date | null;
  /** frozen at publication (F04); null when it is not known (PWA adapter) */
  publishedServiceStartAt: Date | null;
}

export interface EtaPlanInput {
  dayPlanId: string;
  planVersion: number;
  planDate: string;
  timezone: string;
  /** origin_source <> 'NONE' */
  hasOrigin: boolean;
  departureAt: Date | null;
  approximate: boolean;
  stops: EtaPlanStop[];
}

export interface EtaRealEvents {
  /** per appointment; abandoned execution => both null */
  executions: Map<string, { startedAt: Date | null; finishedAt: Date | null }>;
  /** latest-of-day late notice per appointment */
  lateNotices: Map<
    string,
    { minutesLate: number; createdAt: Date; clientOccurredAt: Date | null }
  >;
}

export type ProjectedStopState = 'DONE' | 'IN_PROGRESS' | 'PENDING';

export interface ProjectedStop {
  appointmentId: string;
  state: ProjectedStopState;
  windowStartAt: Date;
  windowEndAt: Date;
  windowTimezone: string;
  projectedArrivalAt: Date | null;
  projectedStartAt: Date | null;
  projectedEndAt: Date | null;
  /** max(0, start − end of the window), in seconds */
  lateS: number;
  floorApplied: boolean;
}

const PLAUSIBLE_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const PLAUSIBLE_FUTURE_MS = 5 * 60 * 1000;

const epochS = (d: Date): number => Math.floor(d.getTime() / 1000);
const fromEpochS = (s: number): Date => new Date(s * 1000);

/**
 * Effective time of a `LATE_NOTICE`, replicating the backend
 * `resolveEffectiveEventTime` rule (F03 L-F03-06 / D25) purely: the device time
 * is trusted only when plausible relative to the server time at recording
 * (`createdAt`), otherwise the server time is used.
 */
function effectiveNoticeAtS(createdAt: Date, clientOccurredAt: Date | null): number {
  if (clientOccurredAt === null) return epochS(createdAt);
  const client = clientOccurredAt.getTime();
  if (Number.isNaN(client)) return epochS(createdAt);
  const delta = createdAt.getTime() - client;
  const plausible = delta <= PLAUSIBLE_PAST_MS && delta >= -PLAUSIBLE_FUTURE_MS;
  return Math.floor((plausible ? client : createdAt.getTime()) / 1000);
}

function classify(
  stop: EtaPlanStop,
  exec: { startedAt: Date | null; finishedAt: Date | null } | undefined,
): ProjectedStopState {
  if (stop.appointmentStatus === 'DONE' || exec?.finishedAt != null) return 'DONE';
  if (exec?.startedAt != null && exec.finishedAt == null) return 'IN_PROGRESS';
  return 'PENDING';
}

interface Projected {
  arrivalS: number | null;
  startS: number | null;
  endS: number | null;
  floorApplied: boolean;
}

/** Build the OptimizerInput for a tail of pending stops anchored at `anchorEndS`. */
function buildPendingInput(
  pending: EtaPlanStop[],
  hasAnchor: boolean,
  anchorEndS: number | null,
  nowS: number,
): { input: OptimizerInput; legTravelS: Array<number | null> } {
  let coordCount = 0;
  const optimizerStops: OptimizerStop[] = pending.map((s) => {
    const matrixIndex = s.missingCoordinates ? null : ++coordCount;
    return {
      key: s.appointmentId,
      windowStartS: epochS(s.windowStartAt),
      windowEndS: epochS(s.windowEndAt),
      serviceS: s.durationMinutes * 60,
      matrixIndex,
    };
  });
  const size = coordCount + 1; // origin at index 0 + coordinate stops 1..coordCount
  const travelS = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const legTravelS = pending.map((s) => s.travelS);
  return {
    input: {
      stops: optimizerStops,
      travelS,
      originIndex: hasAnchor ? 0 : null,
      earliestDepartureS: Math.max(anchorEndS ?? nowS, nowS),
      weights: DEFAULT_ROUTE_WEIGHTS,
    },
    legTravelS,
  };
}

/** Project a pending tail into absolute epoch seconds via evaluateSequence. */
function projectTail(
  pending: EtaPlanStop[],
  hasAnchor: boolean,
  anchorEndS: number | null,
  nowS: number,
): Projected[] {
  if (pending.length === 0) return [];
  const { input, legTravelS } = buildPendingInput(pending, hasAnchor, anchorEndS, nowS);
  const ev = evaluateSequence(
    input,
    pending.map((s) => s.appointmentId),
    { legTravelS },
  );
  const byKey = new Map(ev.stops.map((s) => [s.key, s]));
  return pending.map((s) => {
    const e = byKey.get(s.appointmentId)!;
    return { arrivalS: e.arrivalS, startS: e.serviceStartS, endS: e.serviceEndS, floorApplied: false };
  });
}

export function projectStopEta(
  plan: EtaPlanInput,
  events: EtaRealEvents,
  now: Date,
): ProjectedStop[] {
  const nowS = epochS(now);

  // 1. Filter + classify.
  const kept = plan.stops
    .filter((s) => s.appointmentStatus === 'SCHEDULED' || s.appointmentStatus === 'DONE')
    .map((s) => ({ stop: s, state: classify(s, events.executions.get(s.appointmentId)) }));

  // Computation order: executed (DONE/IN_PROGRESS) by sequence, then pending by sequence.
  const executed = kept
    .filter((k) => k.state !== 'PENDING')
    .sort((a, b) => a.stop.sequence - b.stop.sequence);
  const pending = kept
    .filter((k) => k.state === 'PENDING')
    .sort((a, b) => a.stop.sequence - b.stop.sequence)
    .map((k) => k.stop);

  // 2. Anchor from the last executed (or the origin).
  let anchorEndS: number | null;
  const hasAnchor = executed.length > 0 || plan.hasOrigin;
  if (executed.length === 0) {
    anchorEndS = plan.hasOrigin && plan.departureAt ? epochS(plan.departureAt) : null;
  } else {
    const last = executed[executed.length - 1]!;
    const exec = events.executions.get(last.stop.appointmentId);
    if (last.state === 'IN_PROGRESS' && exec?.startedAt) {
      anchorEndS = Math.max(nowS, epochS(exec.startedAt) + last.stop.durationMinutes * 60);
    } else if (exec?.finishedAt) {
      anchorEndS = epochS(exec.finishedAt);
    } else {
      // DONE without execution (OP-marked): never in the future.
      const endS = last.stop.serviceEndAt ? epochS(last.stop.serviceEndAt) : nowS;
      anchorEndS = Math.min(endS, nowS);
    }
  }

  // 3–4. Project the pending tail.
  const projected = projectTail(pending, hasAnchor, anchorEndS, nowS);

  // 5. LATE_NOTICE floor (D18): raise a pending stop's start to the announced
  // arrival and re-evaluate the tail from it.
  for (let j = 0; j < pending.length; j++) {
    const note = events.lateNotices.get(pending[j]!.appointmentId);
    if (!note) continue;
    const s = pending[j]!;
    const referenceS = epochS(s.publishedServiceStartAt ?? s.windowStartAt);
    const floorS =
      Math.max(referenceS, effectiveNoticeAtS(note.createdAt, note.clientOccurredAt)) +
      note.minutesLate * 60;
    if (floorS <= projected[j]!.startS!) continue;
    const endS = floorS + s.durationMinutes * 60;
    projected[j] = { arrivalS: floorS, startS: floorS, endS, floorApplied: true };
    const tail = projectTail(pending.slice(j + 1), true, endS, nowS);
    for (let k = 0; k < tail.length; k++) projected[j + 1 + k] = tail[k]!;
  }

  // 6. Build the output, sorted by sequence (E14).
  const result: ProjectedStop[] = [];
  const pendingIndex = new Map(pending.map((s, i) => [s.appointmentId, i]));
  for (const { stop: s, state } of kept) {
    const base = {
      appointmentId: s.appointmentId,
      state,
      windowStartAt: s.windowStartAt,
      windowEndAt: s.windowEndAt,
      windowTimezone: s.windowTimezone,
    };
    if (state === 'PENDING') {
      const p = projected[pendingIndex.get(s.appointmentId)!]!;
      const windowEndS = Math.max(epochS(s.windowEndAt), epochS(s.windowStartAt));
      result.push({
        ...base,
        projectedArrivalAt: p.arrivalS === null ? null : fromEpochS(p.arrivalS),
        projectedStartAt: p.startS === null ? null : fromEpochS(p.startS),
        projectedEndAt: p.endS === null ? null : fromEpochS(p.endS),
        lateS: p.startS === null ? 0 : Math.max(0, p.startS - windowEndS),
        floorApplied: p.floorApplied,
      });
    } else {
      const exec = events.executions.get(s.appointmentId);
      const startedAt = exec?.startedAt ?? null;
      result.push({
        ...base,
        projectedArrivalAt: startedAt,
        projectedStartAt: startedAt,
        projectedEndAt: exec?.finishedAt ?? (anchorEndS === null ? null : fromEpochS(anchorEndS)),
        lateS: 0,
        floorApplied: false,
      });
    }
  }
  return result.sort((a, b) => aptSeq(plan, a.appointmentId) - aptSeq(plan, b.appointmentId));
}

function aptSeq(plan: EtaPlanInput, appointmentId: string): number {
  return plan.stops.find((s) => s.appointmentId === appointmentId)?.sequence ?? 0;
}

export function isProjectedLate(stop: ProjectedStop, thresholdMinutes: number): boolean {
  return (
    stop.state === 'PENDING' &&
    stop.projectedStartAt !== null &&
    epochS(stop.projectedStartAt) > epochS(stop.windowEndAt) + thresholdMinutes * 60
  );
}

/**
 * Adapter for consumers that only have the HTTP {@link DayPlanResponse} (the
 * PWA). `publishedServiceStartAt` is left null — the response does not expose
 * it, so the `LATE_NOTICE` floor falls back to the window start (D18). Backend
 * consumers (F05) build {@link EtaPlanInput} from raw rows with the published
 * start instead. `tenantId`/`scheduledDate` are not used by the projection and
 * are filled from the plan for completeness.
 */
export function etaPlanInputFromDayPlanResponse(plan: DayPlanResponse): EtaPlanInput {
  return {
    dayPlanId: plan.id,
    planVersion: plan.version,
    planDate: plan.date,
    timezone: plan.timezone,
    hasOrigin: plan.origin.source !== 'NONE',
    departureAt: plan.departureAt ? new Date(plan.departureAt) : null,
    approximate: plan.approximate,
    stops: plan.stops.map((s) => ({
      appointmentId: s.appointmentId,
      sequence: s.sequence,
      tenantId: '',
      scheduledDate: plan.date,
      appointmentStatus: s.appointmentStatus,
      travelS: s.travelS,
      durationMinutes: s.durationMinutes,
      windowStartAt: new Date(s.windowStartAt),
      windowEndAt: new Date(s.windowEndAt),
      windowTimezone: s.timezone,
      missingCoordinates: s.missingCoordinates,
      serviceStartAt: s.serviceStartAt ? new Date(s.serviceStartAt) : null,
      serviceEndAt: s.serviceEndAt ? new Date(s.serviceEndAt) : null,
      publishedServiceStartAt: null,
    })),
  };
}
