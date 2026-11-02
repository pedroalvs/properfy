import {
  type DayPlanComputeTrigger,
  type DayPlanOriginSource,
  type InspectorBaseAddress,
  type RouteWeights,
} from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import {
  classifyStops,
  type ClassifiableStop,
} from '../../domain/classify-stops';
import { isPublicationOpenForInspector } from '../../domain/publication-window';
import { fingerprintForCandidates } from '../day-plan-inputs';
import type { DayPlanCandidate, IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type {
  IDayPlanRepository,
  SaveDayPlanInput,
  SaveDayPlanStop,
} from '../../domain/day-plan.repository';
import type {
  PlanRouteService} from '../services/plan-route.service';
import {
  type PlanRouteMode,
  type PlanRouteStopInput,
  type StoredRoutingMatrix,
} from '../services/plan-route.service';

export interface ComputeDayPlanInput {
  inspectorId: string;
  /** Civil `YYYY-MM-DD`. */
  date: string;
  trigger: DayPlanComputeTrigger;
  actorUserId?: string | null;
  /** Explicit reorderable order for a REORDER trigger (the inspector's saved order). */
  fixedOrder?: string[];
  /**
   * Day-origin override to apply (ORIGIN_CHANGE): an object sets it, `null` clears it,
   * `undefined` keeps the plan's current override. Coordinates come from permanent geocoding.
   */
  applyOrigin?: { address: InspectorBaseAddress; lat: number; lng: number } | null;
  /** Job mode retry counter (1-based). Only SCHEDULED_PUBLISH uses it. */
  attempt?: number;
  now?: Date;
}

const MAX_SAVE_ATTEMPTS = 3;

export class ComputeDayPlanUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly planRoute: PlanRouteService,
    private readonly settings: IPlatformSettingsReader,
    private readonly logger: Logger,
    private readonly clock: Clock,
  ) {}

  async execute(input: ComputeDayPlanInput): Promise<DayPlanRecord> {
    const now = input.now ?? this.clock.now();

    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const existing = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
      const saved = await this.computeAndSave(input, existing, now);
      if (saved !== null) return saved;
    }
    // Exhausted the CAS retries: return the latest stored plan (its status is STALE).
    const latest = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    if (latest === null) {
      // Extremely rare: lost every insert race but the row vanished. Recompute once more without CAS.
      const inspector = await this.reader.loadInspectorContext(input.inspectorId);
      if (!inspector) throw new Error('INSPECTOR_NOT_FOUND');
    }
    return latest as DayPlanRecord;
  }

  private async computeAndSave(
    input: ComputeDayPlanInput,
    existing: DayPlanRecord | null,
    now: Date,
  ): Promise<DayPlanRecord | null> {
    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector) throw new Error('INSPECTOR_NOT_FOUND');

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);
    const weights = await this.settings.get('routeWeights');

    const classifiable: ClassifiableStop[] = candidates.map((c) => ({
      appointmentId: c.appointmentId,
      appointmentStatus: c.appointmentStatus,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      abandonedAt: c.abandonedAt,
      windowStartAt: c.windowStartAt,
    }));
    const { executed, reorderable } = classifyStops(classifiable);
    const byId = new Map(candidates.map((c) => [c.appointmentId, c] as const));
    const isTodayOrPast = input.date <= todayCivil;

    // --- Origin (configured for fingerprint; effective LAST_STOP for routing) ---
    // Resolve the override to use: applyOrigin (set/clear) wins; otherwise keep the plan's.
    const resolvedOverride =
      input.applyOrigin === undefined
        ? existing?.originOverride && existing.originOverrideLat !== null
          ? {
              address: existing.originOverride,
              lat: existing.originOverrideLat,
              lng: existing.originOverrideLng,
              setAt: existing.originOverrideSetAt ?? now,
            }
          : null
        : input.applyOrigin === null
          ? null
          : { address: input.applyOrigin.address, lat: input.applyOrigin.lat, lng: input.applyOrigin.lng, setAt: now };

    const configured = resolvedOverride
      ? {
          source: 'OVERRIDE' as DayPlanOriginSource,
          lat: resolvedOverride.lat,
          lng: resolvedOverride.lng,
          override: resolvedOverride.address,
        }
      : inspector.baseLat !== null
        ? { source: 'BASE' as DayPlanOriginSource, lat: inspector.baseLat, lng: inspector.baseLng, override: null }
        : { source: 'NONE' as DayPlanOriginSource, lat: null, lng: null, override: null };
    const hasExecutedToday = executed.length > 0 && isTodayOrPast;
    const lastExecuted = hasExecutedToday ? byId.get(executed[executed.length - 1]!.appointmentId) ?? null : null;
    const effectiveSource: DayPlanOriginSource =
      hasExecutedToday && lastExecuted && lastExecuted.lat !== null ? 'LAST_STOP' : configured.source;
    const routingOrigin =
      effectiveSource === 'LAST_STOP' && lastExecuted
        ? { lat: lastExecuted.lat!, lng: lastExecuted.lng! }
        : configured.lat !== null
          ? { lat: configured.lat, lng: configured.lng! }
          : null;

    // --- Fingerprint (uses the CONFIGURED origin, never LAST_STOP) ---
    const fingerprint = fingerprintForCandidates(candidates, configured);

    // --- Routing of the reorderable tail ---
    const mode = this.resolveMode(input, existing);
    const routeStops: PlanRouteStopInput[] = reorderable.map((s) => {
      const c = byId.get(s.appointmentId)!;
      return {
        appointmentId: c.appointmentId,
        location: c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null,
        windowStartAt: c.windowStartAt,
        windowEndAt: c.windowEndAt,
        serviceMinutes: c.durationMinutes,
      };
    });
    const earliestDepartureAt = this.earliestDeparture(now, isTodayOrPast, input.date, todayCivil, existing, lastExecuted);
    const result = await this.planRoute.compute({
      origin: routingOrigin,
      stops: routeStops,
      earliestDepartureAt,
      weights: weights as RouteWeights,
      mode,
      cachedMatrix: input.trigger === 'REORDER' ? (existing?.routingMatrix as StoredRoutingMatrix | undefined) : undefined,
      interactive: input.trigger !== 'SCHEDULED_PUBLISH',
      strict: input.trigger === 'SCHEDULED_PUBLISH' && (input.attempt ?? 1) < 3,
      now,
    });

    // --- Status / publication ---
    const alreadyPublished = existing?.publishedAt != null;
    const windowOpen = isPublicationOpenForInspector(input.date, now, inspector.timezone);
    const status = alreadyPublished || windowOpen ? 'PUBLISHED' : 'DRAFT';
    const publishedAt = status === 'PUBLISHED' ? (existing?.publishedAt ?? now) : null;

    // --- Assemble stops: executed prefix (kept predictions) + reorderable (new) ---
    const prevById = new Map((existing?.stops ?? []).map((s) => [s.appointmentId, s] as const));
    const stops: SaveDayPlanStop[] = [];
    let seq = 1;
    for (const ex of executed) {
      const c = byId.get(ex.appointmentId)!;
      const prev = prevById.get(ex.appointmentId);
      stops.push(this.executedStop(c, prev, seq++));
    }
    for (const r of result.stops) {
      const c = byId.get(r.appointmentId)!;
      const prev = prevById.get(r.appointmentId);
      stops.push(this.reorderableStop(c, r, prev, seq++, mode, status, now));
    }

    const suggestedOrder = result.optimizedOrder ?? result.order;
    const manualOrder =
      mode.kind === 'FIXED_ORDER' ? true : mode.kind === 'PRESERVE_ORDER' ? (existing?.manualOrder ?? false) : false;

    const toSave: SaveDayPlanInput = {
      id: existing?.id ?? null,
      expectedVersion: existing?.version ?? null,
      inspectorId: input.inspectorId,
      planDate: input.date,
      timezone: inspector.timezone,
      status,
      inputFingerprint: fingerprint,
      publishedAt,
      notifiedAt: existing?.notifiedAt ?? null,
      computedAt: now,
      computedByUserId: input.actorUserId ?? null,
      lastTrigger: input.trigger,
      originSource: effectiveSource,
      originLat: routingOrigin?.lat ?? (effectiveSource === 'NONE' ? null : configured.lat),
      originLng: routingOrigin?.lng ?? (effectiveSource === 'NONE' ? null : configured.lng),
      originOverride: resolvedOverride?.address ?? null,
      originOverrideLat: resolvedOverride?.lat ?? null,
      originOverrideLng: resolvedOverride?.lng ?? null,
      originOverrideSetAt: resolvedOverride?.setAt ?? null,
      departureAt: result.departureAt,
      finishEta: result.finishAt,
      totalDriveS: result.totals.driveS,
      totalWaitS: result.totals.waitS,
      totalServiceS: result.totals.serviceS,
      totalLateS: result.totals.lateS,
      totalDistanceM: result.totals.distanceM,
      feasible: result.feasible,
      manualOrder,
      suggestedOrder,
      weights: weights as RouteWeights,
      optimizerMethod: result.method,
      routingProvider: result.provider,
      matrixProfile: result.matrixProfile,
      approximate: result.approximate,
      approximateReason: result.approximateReason,
      routeGeometry: result.geometry,
      routingMatrix: result.matrix,
      legTravel: result.legs.map((l) => ({ fromKey: l.fromKey, toKey: l.toKey, travelS: l.travelS })),
      stops,
    };

    const saved = await this.repo.saveComputed(toSave);
    if (saved !== null) {
      this.logger.info(
        {
          dayPlanId: saved.id,
          inspectorId: input.inspectorId,
          date: input.date,
          trigger: input.trigger,
          stops: saved.stops.map((s) => ({ appointmentId: s.appointmentId, sequence: s.sequence, serviceStartAt: s.serviceStartAt })),
          method: result.method,
          provider: result.provider,
          matrixProfile: result.matrixProfile,
          matrixElements: result.usage.matrixElements,
          directionsCalls: result.usage.directionsCalls,
          approximate: result.approximate,
          approximateReason: result.approximateReason,
          feasible: result.feasible,
        },
        'day_plan.computed',
      );
    }
    return saved;
  }

  private resolveMode(input: ComputeDayPlanInput, existing: DayPlanRecord | null): PlanRouteMode {
    const trigger = input.trigger;
    if (trigger === 'REORDER') {
      return { kind: 'FIXED_ORDER', order: input.fixedOrder ?? (existing ? this.reorderableOrder(existing) : []) };
    }
    if (trigger === 'MANUAL_RECALC' || trigger === 'SCHEDULED_PUBLISH') return { kind: 'OPTIMIZE' };
    // ON_OPEN / ORIGIN_CHANGE: preserve a manual order, else optimize.
    if (existing?.manualOrder) return { kind: 'PRESERVE_ORDER', order: this.reorderableOrder(existing) };
    return { kind: 'OPTIMIZE' };
  }

  private reorderableOrder(existing: DayPlanRecord): string[] {
    return existing.stops.filter((s) => !s.executed).map((s) => s.appointmentId);
  }

  private earliestDeparture(
    now: Date,
    isTodayOrPast: boolean,
    date: string,
    todayCivil: string,
    existing: DayPlanRecord | null,
    lastExecuted: DayPlanCandidate | null,
  ): Date | null {
    if (date !== todayCivil) return null;
    if (lastExecuted) {
      const base = lastExecuted.finishedAt ?? (lastExecuted.startedAt ? new Date(lastExecuted.startedAt.getTime() + lastExecuted.durationMinutes * 60_000) : now);
      return new Date(Math.max(now.getTime(), base.getTime()));
    }
    const planned = existing?.departureAt ?? now;
    return new Date(Math.max(now.getTime(), planned.getTime()));
  }

  private executedStop(
    c: DayPlanCandidate,
    prev: DayPlanRecord['stops'][number] | undefined,
    sequence: number,
  ): SaveDayPlanStop {
    return {
      appointmentId: c.appointmentId,
      sequence,
      eta: prev?.eta ?? null,
      serviceStartAt: prev?.serviceStartAt ?? null,
      serviceEndAt: prev?.serviceEndAt ?? null,
      publishedEta: prev?.publishedEta ?? null,
      publishedServiceStartAt: prev?.publishedServiceStartAt ?? null,
      publishedPredictedAt: prev?.publishedPredictedAt ?? null,
      publishedApproximate: prev?.publishedApproximate ?? null,
      travelS: prev?.travelS ?? 0,
      distanceM: prev?.distanceM ?? null,
      waitS: prev?.waitS ?? 0,
      lateS: prev?.lateS ?? 0,
      windowStartAt: c.windowStartAt,
      windowEndAt: c.windowEndAt,
      windowTimezone: c.tenantTimezone,
      durationMinutes: c.durationMinutes,
      lat: c.lat,
      lng: c.lng,
      manual: prev?.manual ?? false,
      executed: true,
      approximate: prev?.approximate ?? false,
      missingCoordinates: c.lat === null,
    };
  }

  private reorderableStop(
    c: DayPlanCandidate,
    r: Awaited<ReturnType<PlanRouteService['compute']>>['stops'][number],
    prev: DayPlanRecord['stops'][number] | undefined,
    sequence: number,
    mode: PlanRouteMode,
    status: string,
    now: Date,
  ): SaveDayPlanStop {
    const published = status === 'PUBLISHED';
    // Freeze published_* on first publication; copy from prev otherwise; never overwrite.
    const publishedEta = published ? (prev?.publishedEta ?? r.arrivalAt) : null;
    const publishedServiceStartAt = published ? (prev?.publishedServiceStartAt ?? r.serviceStartAt) : null;
    const publishedPredictedAt = published ? (prev?.publishedPredictedAt ?? now) : null;
    const publishedApproximate = published ? (prev?.publishedApproximate ?? r.approximate) : null;
    return {
      appointmentId: c.appointmentId,
      sequence,
      eta: r.arrivalAt,
      serviceStartAt: r.serviceStartAt,
      serviceEndAt: r.serviceEndAt,
      publishedEta,
      publishedServiceStartAt,
      publishedPredictedAt,
      publishedApproximate,
      travelS: r.travelS,
      distanceM: r.distanceM,
      waitS: r.waitS,
      lateS: r.lateS,
      windowStartAt: c.windowStartAt,
      windowEndAt: c.windowEndAt,
      windowTimezone: c.tenantTimezone,
      durationMinutes: c.durationMinutes,
      lat: c.lat,
      lng: c.lng,
      manual: mode.kind === 'FIXED_ORDER' || (mode.kind === 'PRESERVE_ORDER' && (prev?.manual ?? false)),
      executed: false,
      approximate: r.approximate,
      missingCoordinates: r.missingCoordinates,
    };
  }
}
