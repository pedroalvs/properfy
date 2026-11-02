import {
  evaluateSequence,
  optimizeRoute,
  insertIntoOrder,
  haversineMeters,
  ROUTE_MATRIX_MAX_COORDINATES,
  type OptimizerInput,
  type OptimizerStop,
  type OptimizerMethod,
  type RouteWeights,
  type SequenceEvaluation,
} from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { MetricsCollector } from '../../../../shared/infrastructure/metrics';
import {
  RoutingProviderError,
  RoutingDeferredError,
  type IRoutingService,
  type MatrixProfile,
  type RoutePoint,
  type RoutingProviderName,
} from '../../domain/routing.service';

const IDENTICAL_POINT_METERS = 10;
const INTERACTIVE_MAX_WAIT_MS = 3000;
const JOB_MAX_WAIT_MS = 60000;
const INTERACTIVE_DEADLINE_MS = 12000;
const JOB_DEADLINE_MS = 60000;

export type ApproximateReason =
  | 'NO_PROVIDER'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'DEADLINE'
  | 'TOO_MANY_COORDINATES'
  | 'NO_ROUTE'
  | null;

export interface PlanRouteStopInput {
  appointmentId: string;
  location: RoutePoint | null;
  windowStartAt: Date;
  windowEndAt: Date;
  serviceMinutes: number;
}

export type PlanRouteMode =
  | { kind: 'OPTIMIZE' }
  | { kind: 'FIXED_ORDER'; order: string[] }
  | { kind: 'PRESERVE_ORDER'; order: string[] };

export interface StoredRoutingMatrix {
  provider: RoutingProviderName;
  profile: MatrixProfile;
  points: Array<{ key: string; lat: number; lng: number }>;
  travelS: number[][];
}

export interface PlanRouteInput {
  origin: RoutePoint | null;
  stops: PlanRouteStopInput[];
  earliestDepartureAt: Date | null;
  weights: RouteWeights;
  mode: PlanRouteMode;
  cachedMatrix?: StoredRoutingMatrix;
  interactive: boolean;
  strict: boolean;
  now: Date;
}

export interface DayPlanGeometry {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { fromSequence: number; toSequence: number; approximate: boolean };
    geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
  }>;
}

export interface PlanRouteResult {
  method: OptimizerMethod;
  order: string[];
  optimizedOrder: string[] | null;
  departureAt: Date | null;
  finishAt: Date | null;
  stops: Array<{
    appointmentId: string;
    sequence: number;
    arrivalAt: Date;
    serviceStartAt: Date;
    serviceEndAt: Date;
    travelS: number;
    distanceM: number | null;
    waitS: number;
    lateS: number;
    approximate: boolean;
    missingCoordinates: boolean;
  }>;
  totals: { driveS: number; waitS: number; serviceS: number; lateS: number; distanceM: number | null };
  feasible: boolean;
  violations: Array<{ appointmentId: string; lateS: number }>;
  geometry: DayPlanGeometry | null;
  matrix: StoredRoutingMatrix | null;
  provider: RoutingProviderName;
  matrixProfile: MatrixProfile | null;
  approximate: boolean;
  approximateReason: ApproximateReason;
  legs: Array<{ fromKey: string; toKey: string; travelS: number; approximate: boolean }>;
  usage: { matrixElements: number; directionsCalls: number };
}

/** Input for the weights preview (contract 01.14): matrix-only, two weight sets, no persistence. */
export interface PreviewWeightsInput {
  origin: RoutePoint | null;
  stops: PlanRouteStopInput[];
  earliestDepartureAt: Date | null;
  currentWeights: RouteWeights;
  proposedWeights: RouteWeights;
  now: Date;
}

/** One previewed route variant — matrix-sourced ETAs, forward slack, no Directions. */
export interface PreviewRouteVariant {
  order: string[];
  departureAt: Date | null;
  finishAt: Date | null;
  totals: { driveS: number; waitS: number; lateS: number };
  feasible: boolean;
  approximate: boolean;
  stops: Array<{ appointmentId: string; sequence: number; arrivalAt: Date; lateS: number }>;
}

export interface PreviewWeightsResult {
  current: PreviewRouteVariant;
  proposed: PreviewRouteVariant;
  usage: { matrixElements: number; directionsCalls: number };
}

function toEpochS(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function reasonForCode(code: RoutingProviderError['code']): ApproximateReason {
  if (code === 'RATE_LIMITED' || code === 'HTTP_429') return 'RATE_LIMITED';
  if (code === 'TOO_MANY_COORDINATES') return 'TOO_MANY_COORDINATES';
  if (code.startsWith('PROVIDER_CODE_')) return 'NO_ROUTE';
  return 'PROVIDER_ERROR';
}

/** In strict (job) mode, a rate-limit or deadline always defers; other provider errors defer too (attempts 1-2). */
function isDeferrable(code: RoutingProviderError['code']): boolean {
  // Permanent errors are NOT deferrable — deferring cannot fix them.
  return code !== 'TOO_MANY_COORDINATES' && !code.startsWith('PROVIDER_CODE_');
}

export class PlanRouteService {
  constructor(
    private readonly routing: IRoutingService,
    /** Straight-line fallback (haversine stub) injected so this layer imports no infrastructure. */
    private readonly stub: IRoutingService,
    private readonly logger: Logger,
    private readonly metrics: MetricsCollector,
  ) {}

  async compute(input: PlanRouteInput): Promise<PlanRouteResult> {
    const startMs = Date.now();
    const maxWaitMs = input.interactive ? INTERACTIVE_MAX_WAIT_MS : JOB_MAX_WAIT_MS;
    const deadlineMs = input.interactive ? INTERACTIVE_DEADLINE_MS : JOB_DEADLINE_MS;
    const n = input.stops.length;

    if (n === 0) {
      return this.emptyResult();
    }

    // --- Normalize + build the matrix point list ([origin?] + coordinate stops) ---
    const points: RoutePoint[] = [];
    const pointKeys: string[] = [];
    let originIndex: number | null = null;
    if (input.origin) {
      points.push(input.origin);
      pointKeys.push('origin');
      originIndex = 0;
    }
    const optimizerStops: OptimizerStop[] = input.stops.map((s) => {
      let matrixIndex: number | null = null;
      if (s.location) {
        matrixIndex = points.length;
        points.push(s.location);
        pointKeys.push(s.appointmentId);
      }
      return {
        key: s.appointmentId,
        windowStartS: toEpochS(s.windowStartAt),
        windowEndS: toEpochS(s.windowEndAt),
        serviceS: s.serviceMinutes * 60,
        matrixIndex,
      };
    });
    const coordinateStopCount = points.length - (originIndex === null ? 0 : 1);

    let approximate = false;
    let approximateReason: ApproximateReason = null;

    // --- Obtain the travel matrix (provider, cache, or stub) ---
    const matrixOutcome = await this.resolveMatrix(input, points, coordinateStopCount, maxWaitMs);
    const travelS = matrixOutcome.travelS;
    let provider: RoutingProviderName = matrixOutcome.provider;
    const matrixProfile: MatrixProfile | null = matrixOutcome.profile;
    if (matrixOutcome.approximate) {
      approximate = true;
      approximateReason = matrixOutcome.reason;
    }

    const optimizerInput: OptimizerInput = {
      stops: optimizerStops,
      travelS,
      originIndex,
      earliestDepartureS: input.earliestDepartureAt ? toEpochS(input.earliestDepartureAt) : null,
      weights: input.weights,
    };

    // --- Decide the order ---
    let order: string[];
    let method: OptimizerMethod;
    let optimizedOrder: string[] | null = null;
    if (input.mode.kind === 'FIXED_ORDER') {
      order = input.mode.order;
      method = 'FIXED';
    } else if (input.mode.kind === 'PRESERVE_ORDER') {
      const priorOrder = input.mode.order;
      const priorSet = new Set(priorOrder);
      const newKeys = optimizerStops.map((s) => s.key).filter((k) => !priorSet.has(k));
      const res = insertIntoOrder(optimizerInput, priorOrder, newKeys);
      order = res.order;
      method = res.method;
    } else {
      const res = optimizeRoute(optimizerInput);
      order = res.order;
      method = res.method;
      optimizedOrder = res.order;
    }

    // --- Final Directions pass (per-leg depart_at, recompute timeline after each leg) ---
    const matrixEval = evaluateSequence(optimizerInput, order);
    const stopByKey = new Map(optimizerStops.map((s) => [s.key, s]));
    const legTravelS: Array<number | null> = new Array(order.length).fill(null);
    const legDistanceM: Array<number | null> = new Array(order.length).fill(null);
    const legApprox: boolean[] = new Array(order.length).fill(false);
    const features: DayPlanGeometry['features'] = [];
    let directionsCalls = 0;
    let timeline: SequenceEvaluation = matrixEval;
    let lastCoordSeq = originIndex === null ? -1 : 0; // geometry sequence of the last coordinate point (origin = 0)
    let deadlineHit = false;

    for (let i = 0; i < order.length; i += 1) {
      const key = order[i]!;
      const stop = stopByKey.get(key)!;
      const toSeq = i + 1;

      if (stop.matrixIndex === null) {
        // No coordinate: time-only stop, no leg, no geometry.
        legTravelS[i] = 0;
        continue;
      }
      const toPoint = points[stop.matrixIndex]!;
      const fromCoordSeq = lastCoordSeq;
      const hasIncomingLeg = fromCoordSeq >= 0;

      if (!hasIncomingLeg) {
        // First coordinate stop without an origin: no leg to measure.
        legTravelS[i] = 0;
        lastCoordSeq = toSeq;
        timeline = evaluateSequence(optimizerInput, order, { legTravelS });
        continue;
      }

      const fromPoint = this.pointForSequence(points, originIndex, order, stopByKey, fromCoordSeq);
      const departAtS = fromCoordSeq === 0 && originIndex !== null
        ? matrixEval.departureS
        : timeline.stops[this.orderIndexForSeq(order, fromCoordSeq)]?.serviceEndS ?? matrixEval.departureS;

      // Identical points (same property / geocoding): 0 s leg, no call, no feature.
      if (haversineMeters(fromPoint, toPoint) < IDENTICAL_POINT_METERS) {
        legTravelS[i] = 0;
        legDistanceM[i] = 0;
        legApprox[i] = false;
        lastCoordSeq = toSeq;
        timeline = evaluateSequence(optimizerInput, order, { legTravelS });
        continue;
      }

      // Deadline: remaining legs approximate (interactive) or defer (strict).
      if (Date.now() - startMs > deadlineMs) {
        if (input.strict) throw new RoutingDeferredError('DEADLINE');
        deadlineHit = true;
      }

      const departAt = departAtS === null ? undefined : new Date(departAtS * 1000);
      let legProvider: RoutingProviderName = provider;
      try {
        if (deadlineHit) throw new RoutingProviderError('TIMEOUT', 'deadline');
        const leg = await this.routing.directions([fromPoint, toPoint], { departAt, maxWaitMs });
        directionsCalls += 1;
        legTravelS[i] = leg.durationS;
        legDistanceM[i] = leg.distanceM;
        legProvider = leg.provider;
        legApprox[i] = leg.provider === 'STUB';
        features.push({
          type: 'Feature',
          properties: { fromSequence: fromCoordSeq, toSequence: toSeq, approximate: legApprox[i]! },
          geometry: leg.geometry,
        });
      } catch (e) {
        const code = e instanceof RoutingProviderError ? e.code : 'NETWORK';
        if (input.strict && !deadlineHit && isDeferrable(code)) {
          throw new RoutingDeferredError(code === 'RATE_LIMITED' || code === 'HTTP_429' ? 'RATE_LIMITED' : 'PROVIDER_ERROR', e);
        }
        // Interactive (or permanent error, or post-deadline): stub this leg.
        // usage.directionsCalls counts only successful provider Directions calls,
        // so a stubbed leg adds nothing here.
        const stubLeg = await this.stub.directions([fromPoint, toPoint]);
        legTravelS[i] = stubLeg.durationS;
        legDistanceM[i] = stubLeg.distanceM;
        legApprox[i] = true;
        legProvider = 'STUB';
        approximate = true;
        approximateReason = approximateReason ?? (deadlineHit ? 'DEADLINE' : reasonForCode(code));
        features.push({
          type: 'Feature',
          properties: { fromSequence: fromCoordSeq, toSequence: toSeq, approximate: true },
          geometry: stubLeg.geometry,
        });
      }
      if (legProvider === 'STUB') provider = 'STUB';
      lastCoordSeq = toSeq;
      timeline = evaluateSequence(optimizerInput, order, { legTravelS });
    }

    const finalEval = evaluateSequence(optimizerInput, order, { legTravelS });

    this.logger.info(
      {
        stops: order.length,
        method,
        provider,
        matrixProfile,
        matrixElements: matrixOutcome.elements,
        directionsCalls,
        approximate,
        approximateReason,
        feasible: finalEval.feasible,
        durationMs: Date.now() - startMs,
      },
      'day_plan.route_computed',
    );

    return this.buildResult({
      input,
      order,
      method,
      optimizedOrder,
      finalEval,
      legTravelS,
      legDistanceM,
      legApprox,
      features,
      provider,
      matrixProfile,
      storedMatrix: matrixOutcome.stored,
      approximate,
      approximateReason,
      usage: { matrixElements: matrixOutcome.elements, directionsCalls },
      originIndex,
    });
  }

  /**
   * Weights preview (contract 01.14, F04-2b): resolve the travel matrix **once**
   * and evaluate two weight sets over it. Matrix-only — no Directions call, no
   * geometry, nothing persisted — so ETAs are the matrix timeline with forward
   * slack (`etaSource 'MATRIX'`). Always interactive/non-strict: a provider
   * failure degrades to the stub with `approximate`, never defers.
   */
  async previewWeights(input: PreviewWeightsInput): Promise<PreviewWeightsResult> {
    const maxWaitMs = INTERACTIVE_MAX_WAIT_MS;

    // Build the matrix point list ([origin?] + coordinate stops), exactly like compute().
    const points: RoutePoint[] = [];
    let originIndex: number | null = null;
    if (input.origin) {
      points.push(input.origin);
      originIndex = 0;
    }
    const optimizerStops: OptimizerStop[] = input.stops.map((s) => {
      let matrixIndex: number | null = null;
      if (s.location) {
        matrixIndex = points.length;
        points.push(s.location);
      }
      return {
        key: s.appointmentId,
        windowStartS: toEpochS(s.windowStartAt),
        windowEndS: toEpochS(s.windowEndAt),
        serviceS: s.serviceMinutes * 60,
        matrixIndex,
      };
    });
    const coordinateStopCount = points.length - (originIndex === null ? 0 : 1);

    // One matrix resolution shared by both variants (the weights never affect the matrix).
    const matrixInput: PlanRouteInput = {
      origin: input.origin,
      stops: input.stops,
      earliestDepartureAt: input.earliestDepartureAt,
      weights: input.currentWeights,
      mode: { kind: 'OPTIMIZE' },
      interactive: true,
      strict: false,
      now: input.now,
    };
    const matrixOutcome = await this.resolveMatrix(matrixInput, points, coordinateStopCount, maxWaitMs);
    const travelS = matrixOutcome.travelS;
    const earliestDepartureS = input.earliestDepartureAt ? toEpochS(input.earliestDepartureAt) : null;

    const variantFor = (weights: RouteWeights): PreviewRouteVariant => {
      const optimizerInput: OptimizerInput = {
        stops: optimizerStops,
        travelS,
        originIndex,
        earliestDepartureS,
        weights,
      };
      const { order } = optimizeRoute(optimizerInput);
      const ev = evaluateSequence(optimizerInput, order);
      return {
        order,
        departureAt: ev.departureS === null ? null : new Date(ev.departureS * 1000),
        finishAt: ev.finishS === null ? null : new Date(ev.finishS * 1000),
        totals: { driveS: ev.totalTravelS, waitS: ev.totalWaitS, lateS: ev.totalLateS },
        feasible: ev.feasible,
        approximate: matrixOutcome.approximate,
        stops: ev.stops.map((es) => ({
          appointmentId: es.key,
          sequence: es.sequence,
          arrivalAt: new Date(es.arrivalS * 1000),
          lateS: es.lateS,
        })),
      };
    };

    return {
      current: variantFor(input.currentWeights),
      proposed: variantFor(input.proposedWeights),
      usage: { matrixElements: matrixOutcome.elements, directionsCalls: 0 },
    };
  }

  // ---- helpers ----

  private emptyResult(): PlanRouteResult {
    return {
      method: 'TRIVIAL',
      order: [],
      optimizedOrder: null,
      departureAt: null,
      finishAt: null,
      stops: [],
      totals: { driveS: 0, waitS: 0, serviceS: 0, lateS: 0, distanceM: 0 },
      feasible: true,
      violations: [],
      geometry: null,
      matrix: null,
      provider: 'STUB',
      matrixProfile: null,
      approximate: false,
      approximateReason: null,
      legs: [],
      usage: { matrixElements: 0, directionsCalls: 0 },
    };
  }

  private async resolveMatrix(
    input: PlanRouteInput,
    points: RoutePoint[],
    coordinateStopCount: number,
    maxWaitMs: number,
  ): Promise<{
    travelS: number[][];
    provider: RoutingProviderName;
    profile: MatrixProfile | null;
    approximate: boolean;
    reason: ApproximateReason;
    elements: number;
    stored: StoredRoutingMatrix | null;
  }> {
    const needsProviderMatrix =
      (input.mode.kind === 'OPTIMIZE' || input.mode.kind === 'PRESERVE_ORDER') && coordinateStopCount >= 2;

    // Reuse a cached matrix without any provider call.
    if (input.cachedMatrix) {
      return {
        travelS: input.cachedMatrix.travelS,
        provider: input.cachedMatrix.provider,
        profile: input.cachedMatrix.profile,
        approximate: false,
        reason: null,
        elements: input.cachedMatrix.travelS.length * input.cachedMatrix.travelS.length,
        stored: input.cachedMatrix,
      };
    }

    if (!needsProviderMatrix) {
      // Ordering not needed (0/1 coordinate stops) or FIXED without cache: a local
      // stub matrix only seeds the timeline; the real legs come from Directions.
      const m = await this.stub.matrix(points);
      return {
        travelS: m.durationsS,
        provider: 'STUB',
        profile: null,
        approximate: false,
        reason: null,
        elements: 0,
        stored: null,
      };
    }

    // > 25 coordinates: never call the provider; stub, approximate.
    if (points.length > ROUTE_MATRIX_MAX_COORDINATES) {
      this.logger.info({ coordinates: points.length }, 'routing.too_many_coordinates');
      const m = await this.stub.matrix(points);
      return {
        travelS: m.durationsS,
        provider: 'STUB',
        profile: 'haversine',
        approximate: true,
        reason: 'TOO_MANY_COORDINATES',
        elements: points.length * points.length,
        stored: this.toStored(m.durationsS, 'STUB', 'haversine', points, input),
      };
    }

    try {
      const m = await this.routing.matrix(points, { maxWaitMs });
      const travelS = this.fillNullPairs(m.durationsS, m.nullPairs, points);
      const approximate = m.nullPairs.length > 0 || m.provider === 'STUB';
      return {
        travelS,
        provider: m.provider,
        profile: m.profile,
        approximate,
        reason: approximate ? (m.provider === 'STUB' ? 'NO_PROVIDER' : 'NO_ROUTE') : null,
        elements: points.length * points.length,
        stored: this.toStored(travelS, m.provider, m.profile, points, input),
      };
    } catch (e) {
      const code = e instanceof RoutingProviderError ? e.code : 'NETWORK';
      if (input.strict && isDeferrable(code)) {
        throw new RoutingDeferredError(code === 'RATE_LIMITED' || code === 'HTTP_429' ? 'RATE_LIMITED' : 'PROVIDER_ERROR', e);
      }
      this.logger.info({ reason: code, api: 'matrix' }, 'routing.fallback');
      const m = await this.stub.matrix(points);
      return {
        travelS: m.durationsS,
        provider: 'STUB',
        profile: 'haversine',
        approximate: true,
        reason: reasonForCode(code),
        elements: points.length * points.length,
        stored: this.toStored(m.durationsS, 'STUB', 'haversine', points, input),
      };
    }
  }

  private toStored(
    travelS: number[][],
    provider: RoutingProviderName,
    profile: MatrixProfile,
    points: RoutePoint[],
    input: PlanRouteInput,
  ): StoredRoutingMatrix {
    const keys: string[] = [];
    if (input.origin) keys.push('origin');
    for (const s of input.stops) if (s.location) keys.push(s.appointmentId);
    return {
      provider,
      profile,
      travelS,
      points: points.map((p, i) => ({ key: keys[i] ?? `p${i}`, lat: p.lat, lng: p.lng })),
    };
  }

  private fillNullPairs(
    durationsS: number[][],
    nullPairs: Array<[number, number]>,
    points: RoutePoint[],
  ): number[][] {
    if (nullPairs.length === 0) return durationsS;
    const filled = durationsS.map((row) => [...row]);
    for (const [i, j] of nullPairs) {
      const dist = haversineMeters(points[i]!, points[j]!) * 1.3;
      filled[i]![j] = Math.round(dist / (40 / 3.6));
    }
    return filled;
  }

  private pointForSequence(
    points: RoutePoint[],
    originIndex: number | null,
    order: string[],
    stopByKey: Map<string, OptimizerStop>,
    seq: number,
  ): RoutePoint {
    if (seq === 0 && originIndex !== null) return points[originIndex]!;
    const key = order[seq - 1]!;
    const stop = stopByKey.get(key)!;
    return points[stop.matrixIndex!]!;
  }

  private orderIndexForSeq(order: string[], seq: number): number {
    // geometry sequence k (>=1) maps to order[k-1]; origin (0) has no order index.
    return seq - 1;
  }

  private buildResult(args: {
    input: PlanRouteInput;
    order: string[];
    method: OptimizerMethod;
    optimizedOrder: string[] | null;
    finalEval: SequenceEvaluation;
    legTravelS: Array<number | null>;
    legDistanceM: Array<number | null>;
    legApprox: boolean[];
    features: DayPlanGeometry['features'];
    provider: RoutingProviderName;
    matrixProfile: MatrixProfile | null;
    storedMatrix: StoredRoutingMatrix | null;
    approximate: boolean;
    approximateReason: ApproximateReason;
    usage: { matrixElements: number; directionsCalls: number };
    originIndex: number | null;
  }): PlanRouteResult {
    const { input, order, finalEval, legTravelS, legDistanceM, legApprox } = args;
    const locByKey = new Map(input.stops.map((s) => [s.appointmentId, s.location]));

    let driveS = 0;
    let distanceSum = 0;
    let distanceKnown = true;
    const stops = finalEval.stops.map((es, i) => {
      const dist = legDistanceM[i] ?? null;
      if (dist === null && locByKey.get(es.key)) distanceKnown = distanceKnown && legTravelS[i] === 0;
      if (dist !== null) distanceSum += dist;
      driveS += es.travelS;
      return {
        appointmentId: es.key,
        sequence: es.sequence,
        arrivalAt: new Date(es.arrivalS * 1000),
        serviceStartAt: new Date(es.serviceStartS * 1000),
        serviceEndAt: new Date(es.serviceEndS * 1000),
        travelS: es.travelS,
        distanceM: dist,
        waitS: es.waitS,
        lateS: es.lateS,
        approximate: legApprox[i] ?? false,
        missingCoordinates: !locByKey.get(es.key),
      };
    });

    const legs = finalEval.stops.map((es, i) => ({
      fromKey: i === 0 ? (args.originIndex !== null ? 'origin' : es.key) : order[i - 1]!,
      toKey: es.key,
      travelS: es.travelS,
      approximate: legApprox[i] ?? false,
    }));

    const serviceS = input.stops.reduce((acc, s) => acc + s.serviceMinutes * 60, 0);

    return {
      method: args.method,
      order,
      optimizedOrder: args.optimizedOrder,
      departureAt: finalEval.departureS === null ? null : new Date(finalEval.departureS * 1000),
      finishAt: finalEval.finishS === null ? null : new Date(finalEval.finishS * 1000),
      stops,
      totals: {
        driveS,
        waitS: finalEval.totalWaitS,
        serviceS,
        lateS: finalEval.totalLateS,
        distanceM: distanceKnown ? distanceSum : null,
      },
      feasible: finalEval.feasible,
      violations: finalEval.violations.map((v) => ({ appointmentId: v.key, lateS: v.lateS })),
      geometry: args.features.length > 0 ? { type: 'FeatureCollection', features: args.features } : null,
      matrix: args.storedMatrix,
      provider: args.provider,
      matrixProfile: args.matrixProfile,
      approximate: args.approximate,
      approximateReason: args.approximate ? args.approximateReason : null,
      legs,
      usage: args.usage,
    };
  }
}
