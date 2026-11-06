import type {
  AuthContext,
  LiveDayQuery,
  LiveDayResponse,
  LiveDayInspector,
  LiveDayStop,
} from '@properfy/shared';
import {
  COMPLETION_REMINDER_DEDUPE_PREFIX,
  LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS,
  projectStopEta,
} from '@properfy/shared';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import { PLATFORM_TIMEZONE, civilDateInTimezone, nextCivilDay } from '../../../../shared/domain/timezone-date';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import { AppointmentCodeFormatter } from '../../../appointment/domain/appointment-code.formatter';
import type {
  ILiveDayReadRepository,
  LiveDayInspectorRow,
  LiveDayStopRow,
} from '../../domain/live-day.read-repository';
import { filterT1Visible } from '../../domain/filter-t1-visible';
import { deriveInspectorState } from '../../domain/derive-inspector-state';
import { deriveStopProgress } from '../../domain/derive-stop-progress';
import { resolveLastKnownPoint, type LastKnownOriginInput } from '../../domain/resolve-last-known-point';
import { computeAccumulatedDelay } from '../../domain/compute-accumulated-delay';
import { baselineInstant, orderStops, windowStartInstant } from '../../domain/stop-view';
import { configuredFingerprintOrigin, resolvePlanFreshness } from '../../domain/plan-freshness';
import { toEtaPlanInput, toEtaRealEvents } from '../../domain/to-eta-inputs';
import { buildRouteGeometry } from '../../domain/build-route-geometry';
import type { RoutePoint } from '../../domain/build-route-fallback';
import { deriveAlerts } from '../../domain/derive-alerts';
import { parseAlertOverride, resolveEffectiveThresholds } from '../../domain/resolve-effective-thresholds';

/** AM/OP only (D14 cross-tenant read; no `tenant_id` predicate in the repository). */
export const LIVE_DAY_ROLES = ['AM', 'OP'] as const;

export interface GetLiveDayInput {
  actor: AuthContext;
  query: LiveDayQuery;
}

export interface GetLiveDayResult {
  response: LiveDayResponse;
}

interface BuiltInspector {
  inspector: LiveDayInspector;
  orderedVisible: LiveDayStopRow[];
  originPoint: RoutePoint | null;
}

interface InspectorContext {
  date: string;
  t1Today: string;
  isPastDay: boolean;
  now: Date;
  thresholdsDefault: { delayMinutes: number; notStartedMinutes: number };
  checkInWindowTolerance: number;
}

/**
 * Reads the operations "Live Day" screen for one civil date (F05-1).
 *
 * One aggregated SQL query (the repository) feeds pure in-memory derivation — zero
 * Mapbox calls in every `includeGeometry` mode (D13/SC-003). This class owns RBAC,
 * the date default/guard, the T-1 visibility filter, the roster (D19), the STALE
 * fingerprint (D17), the F06 projection, the straight-line geometry and the
 * feasibility indicator.
 *
 * Still a seam (filled by US3): `alerts`/`needsAttention` (T044) and the per-inspector
 * effective thresholds (T043) — platform defaults / empty until wired.
 */
export class GetLiveDayUseCase {
  constructor(
    private readonly repo: ILiveDayReadRepository,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ actor, query }: GetLiveDayInput): Promise<GetLiveDayResult> {
    // 1. RBAC (AM/OP only).
    if (!(LIVE_DAY_ROLES as readonly string[]).includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view the live day');
    }

    // 2. Date: default to the actor's civil today; reject anything after tomorrow.
    const timezone = actor.timezone ?? PLATFORM_TIMEZONE;
    const now = this.clock.now();
    const today = civilDateInTimezone(now, timezone);
    const date = query.date ?? today;
    if (date > nextCivilDay(today)) {
      throw new ValidationError('Pick today, tomorrow or a past date', undefined, 'LIVE_DAY_DATE_TOO_FAR');
    }

    // 3. `selected` requires an inspector to include.
    if (query.includeGeometry === 'selected' && query.inspectorId === undefined) {
      throw new ValidationError(
        'Pick an inspector to include its route',
        undefined,
        'LIVE_DAY_INSPECTOR_REQUIRED',
      );
    }

    // Two platform reads, both through the F03 30 s cache: the alert thresholds and
    // the field-events tolerance (the OUT_OF_WINDOW threshold). No SQL in the hot path.
    const [thresholdsDefault, fieldEvents] = await Promise.all([
      this.platformSettings.get('liveDayAlerts'),
      this.platformSettings.get('fieldEvents'),
    ]);

    // One aggregated query. Geometry is built in memory, so includeGeometry/inspectorId
    // are not repository inputs (the SQL is identical in every mode — SC-003).
    const rows = await this.repo.getDay({ date, completionReminderPrefix: COMPLETION_REMINDER_DEDUPE_PREFIX });

    const ctx: InspectorContext = {
      date,
      // The T-1 filter runs against the platform (Sydney) civil today — the same clock
      // F04's day-plan reader uses — not the viewed date or the actor's tz.
      t1Today: civilDateInTimezone(now, PLATFORM_TIMEZONE),
      isPastDay: date < today,
      now,
      thresholdsDefault,
      checkInWindowTolerance: fieldEvents.checkInWindowToleranceMinutes,
    };

    const built = rows
      .map((row) => this.buildInspector(row, ctx))
      .filter((b): b is BuiltInspector => b !== null);

    // 5. Roster cap (L-F05-06): only `all` is capped, after the query + T-1 roster.
    if (query.includeGeometry === 'all' && built.length > LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS) {
      throw new ValidationError(
        'Too many routes to draw at once. Narrow the list first.',
        { inspectors: built.length, max: LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS },
        'LIVE_DAY_TOO_MANY_ROUTES',
      );
    }

    // 6. Geometry on demand (straight line, in memory, F04 Plan B — zero Mapbox).
    for (const b of built) {
      const include =
        query.includeGeometry === 'all' ||
        (query.includeGeometry === 'selected' && b.inspector.inspectorId === query.inspectorId);
      if (include) {
        b.inspector.geometryIncluded = true;
        b.inspector.geometry = buildRouteGeometry(b.originPoint, b.orderedVisible);
      }
    }

    const inspectors = built
      .map((b) => b.inspector)
      .sort((a, z) => a.inspectorName.localeCompare(z.inspectorName, 'en-AU'));

    return {
      response: {
        date,
        today,
        timezone,
        isToday: date === today,
        generatedAt: now.toISOString(),
        thresholdsDefault: {
          delayMinutes: thresholdsDefault.delayMinutes,
          notStartedMinutes: thresholdsDefault.notStartedMinutes,
        },
        summary: this.summarise(inspectors),
        inspectors,
      },
    };
  }

  /** Build one inspector, or `null` when the roster excludes it (D19). */
  private buildInspector(row: LiveDayInspectorRow, ctx: InspectorContext): BuiltInspector | null {
    const visible = filterT1Visible(row.stops, ctx.t1Today);
    const hasActiveCantDo = row.events.some((e) => e.type === 'CANT_DO' && e.cantDoActive);
    // D19: no live visible work and no active CANT_DO → not on the screen (no "0 of 0").
    if (visible.length === 0 && !hasActiveCantDo) return null;

    const ordered = orderStops(visible);
    const { state, progress } = deriveInspectorState(visible);
    const progressByStop = deriveStopProgress(visible);
    const lastKnown = resolveLastKnownPoint(visible, toOriginInput(row));
    const delayMinutes = computeAccumulatedDelay(visible);
    const freshness = resolvePlanFreshness({
      planId: row.planId,
      storedStatus: row.planStatus,
      storedFingerprint: row.inputFingerprint,
      origin: configuredFingerprintOrigin(row),
      visibleStops: visible,
    });

    // Projected remaining times: only for a plan on today/future (never project onto a
    // past day's clock, L-F05-02). In-plan stops only; out-of-plan use the window start.
    const predictedByAppt = new Map<string, Date | null>();
    if (row.planId !== null && !ctx.isPastDay) {
      const planRows = visible.filter((r) => r.sequence !== null);
      const projected = projectStopEta(
        toEtaPlanInput(row, planRows, ctx.date),
        toEtaRealEvents(visible, row.events),
        ctx.now,
      );
      for (const p of projected) predictedByAppt.set(p.appointmentId, p.projectedStartAt);
    }

    const stops: LiveDayStop[] = ordered.map((stop) => ({
      appointmentId: stop.appointmentId,
      appointmentCode: AppointmentCodeFormatter.formatParts(stop.appointmentNumber, stop.appointmentCodePrefix),
      sequence: stop.sequence,
      inPlan: stop.sequence !== null,
      progress: progressByStop.get(stop.appointmentId) ?? 'REMAINING',
      agencyName: stop.agencyName,
      propertyAddress: stop.street,
      suburb: stop.suburb,
      lat: stop.propertyLat,
      lng: stop.propertyLng,
      missingCoordinates: stop.propertyLat === null || stop.propertyLng === null,
      windowStart: stop.timeSlotStart,
      windowEnd: stop.timeSlotEnd,
      timezone: stop.tenantTimezone,
      startedAt: stop.startedAt,
      finishedAt: stop.finishedAt,
      predictedStartAt: predictedStartAtFor(stop, predictedByAppt, ctx.isPastDay),
      publishedStartAt: stop.publishedServiceStartAt,
      delayMinutes: perStopDelay(stop),
    }));

    const thresholds = resolveEffectiveThresholds(
      parseAlertOverride(row.alertOverridesJson),
      ctx.thresholdsDefault,
    );
    const alerts = deriveAlerts({
      visible,
      events: row.events,
      reminders: row.reminders,
      now: ctx.now,
      isPastDay: ctx.isPastDay,
      state,
      delayMinutes,
      thresholds,
      checkInWindowTolerance: ctx.checkInWindowTolerance,
    });
    const origin = resolveOrigin(row);

    const inspector: LiveDayInspector = {
      inspectorId: row.inspectorId,
      inspectorName: row.inspectorName,
      state,
      lastKnown,
      progress,
      delayMinutes,
      thresholds,
      alerts,
      needsAttention: alerts.length > 0,
      dayPlanId: row.planId,
      planStatus: freshness.planStatus,
      planVersion: row.planVersion,
      routeOutOfDate: freshness.routeOutOfDate,
      // Final (F04 Plan B): the Live Day route is always the in-memory straight line.
      routeApproximate: true,
      routeFeasible: row.feasible ?? true,
      routeViolations: routeViolationsFrom(visible),
      origin,
      // Populated by the caller for the requested inspectors (none → stays off).
      geometryIncluded: false,
      geometry: null,
      stops,
    };

    return {
      inspector,
      orderedVisible: ordered,
      originPoint: origin ? { lat: origin.lat, lng: origin.lng } : null,
    };
  }

  private summarise(inspectors: LiveDayInspector[]): LiveDayResponse['summary'] {
    const summary = {
      inspectors: inspectors.length,
      notStarted: 0,
      atProperty: 0,
      inTransit: 0,
      doneForDay: 0,
      needsAttention: 0,
      stopsDone: 0,
      stopsTotal: 0,
    };
    for (const i of inspectors) {
      if (i.state === 'NOT_STARTED') summary.notStarted++;
      else if (i.state === 'AT_PROPERTY') summary.atProperty++;
      else if (i.state === 'IN_TRANSIT') summary.inTransit++;
      else if (i.state === 'DONE_FOR_DAY') summary.doneForDay++;
      if (i.needsAttention) summary.needsAttention++;
      summary.stopsDone += i.progress.done;
      summary.stopsTotal += i.progress.total;
    }
    return summary;
  }
}

/** Per-stop delay: minutes from the planned baseline to the actual check-in (null if not started). */
function perStopDelay(stop: LiveDayStopRow): number | null {
  if (stop.startedAt === null || stop.abandonedAt !== null) return null;
  const diffMs = new Date(stop.startedAt).getTime() - baselineInstant(stop).getTime();
  return Math.floor(diffMs / 60_000);
}

/**
 * Predicted start: the F06 projection for in-plan stops on today/future; the planned
 * time on a past day (no projection, L-F05-02); the window start for out-of-plan stops.
 */
function predictedStartAtFor(
  stop: LiveDayStopRow,
  predictedByAppt: Map<string, Date | null>,
  isPastDay: boolean,
): string | null {
  if (stop.sequence !== null && predictedByAppt.has(stop.appointmentId)) {
    return predictedByAppt.get(stop.appointmentId)?.toISOString() ?? null;
  }
  if (isPastDay) {
    return stop.publishedServiceStartAt ?? stop.serviceStartAt ?? windowStartInstant(stop).toISOString();
  }
  return windowStartInstant(stop).toISOString();
}

/** Infeasibility as an indicator (FR-025): in-plan stops with `late_s > 0`, by sequence. */
function routeViolationsFrom(visible: LiveDayStopRow[]): LiveDayInspector['routeViolations'] {
  return visible
    .filter((s): s is LiveDayStopRow & { sequence: number } => s.sequence !== null && (s.lateS ?? 0) > 0)
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      appointmentId: s.appointmentId,
      appointmentCode: AppointmentCodeFormatter.formatParts(s.appointmentNumber, s.appointmentCodePrefix),
      sequence: s.sequence,
      lateMinutes: Math.ceil((s.lateS as number) / 60),
    }));
}

function toOriginInput(row: LiveDayInspectorRow): LastKnownOriginInput {
  return {
    originSource: row.originSource,
    originLat: row.originLat,
    originLng: row.originLng,
    originOverrideLat: row.originOverrideLat,
    originOverrideLng: row.originOverrideLng,
    baseLat: row.baseLat,
    baseLng: row.baseLng,
  };
}

/**
 * The origin pin (null for no plan, `NONE`, or `LAST_STOP` — the latter has no
 * separate pin, L-F04-07). A simple label matches `lastKnown`'s convention; the
 * single lean query does not carry the base/override address F04 uses for its label.
 */
function resolveOrigin(
  row: LiveDayInspectorRow,
): { lat: number; lng: number; label: string | null } | null {
  if (row.originSource === 'OVERRIDE' && row.originOverrideLat !== null && row.originOverrideLng !== null) {
    return { lat: row.originOverrideLat, lng: row.originOverrideLng, label: 'Start of day' };
  }
  if (row.originSource === 'BASE' && row.originLat !== null && row.originLng !== null) {
    return { lat: row.originLat, lng: row.originLng, label: 'Base' };
  }
  return null;
}
