import { addCivilDays, type AuthContext, type RouteWeights, type RouteWeightsPreview, type RouteWeightsPreviewResponse } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import { classifyStops, type ClassifiableStop } from '../../domain/classify-stops';
import type { DayPlanCandidate, IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import { dayPlanPreviewDateOutOfRange, inspectorNotFound } from '../../domain/day-plan.errors';
import type { RoutePoint } from '../../domain/routing.service';
import {
  type PlanRouteService,
  type PlanRouteStopInput,
  type PreviewRouteVariant,
} from '../services/plan-route.service';

/** Inclusive upper bound of the preview window, in days ahead of today (L-F04-14). */
const PREVIEW_MAX_DAYS_AHEAD = 14;

export interface PreviewRouteWeightsInput {
  actor: AuthContext;
  inspectorId: string;
  /** Civil `YYYY-MM-DD` in the actor's effective timezone. */
  date: string;
  weights: RouteWeights;
  now?: Date;
}

/**
 * AM/OP what-if on the platform route weights (contract 01.14, L-F04-14).
 *
 * Computes two route variants for one inspector on one upcoming day — `current`
 * from the saved platform `routeWeights`, `proposed` from the request weights —
 * over a single shared travel matrix (1 Matrix call, 0 Directions), using
 * matrix-based ETAs with forward slack. Nothing is persisted.
 *
 * `day_plan` is platform-scoped (no `tenant_id`; root CLAUDE.md §7.1): the
 * inspector is cross-tenant, so access is guarded purely by role — only AM/OP —
 * and never by a tenant predicate. Guard order: role → date-range → inspector.
 */
export class PreviewRouteWeightsUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly planRoute: PlanRouteService,
    private readonly settings: IPlatformSettingsReader,
    private readonly authorization: AuthorizationService,
    private readonly clock: Clock,
  ) {}

  async execute(input: PreviewRouteWeightsInput): Promise<RouteWeightsPreviewResponse> {
    this.authorization.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'day_plan.preview_weights',
      entityType: 'DayPlan',
    });

    const now = input.now ?? this.clock.now();
    // Date range is validated in the ACTOR's effective timezone (L-F04-14).
    // Civil-date arithmetic (not instant + ms) so the +14 bound is DST-safe.
    const actorToday = civilDateInTimezone(now, input.actor.timezone ?? PLATFORM_TIMEZONE);
    const maxCivil = addCivilDays(actorToday, PREVIEW_MAX_DAYS_AHEAD);
    if (input.date < actorToday || input.date > maxCivil) {
      throw dayPlanPreviewDateOutOfRange();
    }

    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector) throw inspectorNotFound();

    // Candidate T-1 visibility is an inspector/agency concern, so it uses the
    // INSPECTOR's today (the DayPlan tz exception, matching GetDayPlanForOperator),
    // not the actor's. Earliest departure is clamped to `now` only when the plan
    // date is the inspector's today, so a same-day preview never emits past ETAs.
    const inspectorToday = civilDateInTimezone(now, inspector.timezone);
    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, inspectorToday);
    const classifiable: ClassifiableStop[] = candidates.map((c) => ({
      appointmentId: c.appointmentId,
      appointmentStatus: c.appointmentStatus,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      abandonedAt: c.abandonedAt,
      windowStartAt: c.windowStartAt,
    }));
    const { reorderable } = classifyStops(classifiable);
    const byId = new Map(candidates.map((c) => [c.appointmentId, c] as const));

    // Configured origin: the inspector's geocoded base, else none. The preview
    // loads no plan row, so there is no saved override, and never LAST_STOP.
    const origin: RoutePoint | null =
      inspector.baseLat !== null && inspector.baseLng !== null
        ? { lat: inspector.baseLat, lng: inspector.baseLng }
        : null;

    const stops: PlanRouteStopInput[] = reorderable.map((s) => {
      const c = byId.get(s.appointmentId)!;
      return {
        appointmentId: c.appointmentId,
        location: c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null,
        windowStartAt: c.windowStartAt,
        windowEndAt: c.windowEndAt,
        serviceMinutes: c.durationMinutes,
      };
    });

    const currentWeights = (await this.settings.get('routeWeights')) as RouteWeights;
    const preview = await this.planRoute.previewWeights({
      origin,
      stops,
      earliestDepartureAt: input.date === inspectorToday ? now : null,
      currentWeights,
      proposedWeights: input.weights,
      now,
    });

    return {
      current: this.toPreview(preview.current, currentWeights, byId),
      proposed: this.toPreview(preview.proposed, input.weights, byId),
    };
  }

  private toPreview(
    variant: PreviewRouteVariant,
    weights: RouteWeights,
    byId: Map<string, DayPlanCandidate>,
  ): RouteWeightsPreview {
    return {
      weights,
      etaSource: 'MATRIX',
      approximate: variant.approximate,
      departureAt: variant.departureAt ? variant.departureAt.toISOString() : null,
      finishEta: variant.finishAt ? variant.finishAt.toISOString() : null,
      totals: variant.totals,
      feasible: variant.feasible,
      stops: variant.stops.map((s) => {
        const c = byId.get(s.appointmentId)!;
        return {
          appointmentId: s.appointmentId,
          sequence: s.sequence,
          appointmentCode: c.appointmentCode,
          suburb: c.suburb,
          windowStart: c.timeSlotStart,
          windowEnd: c.timeSlotEnd,
          timezone: c.tenantTimezone,
          eta: s.arrivalAt.toISOString(),
          lateS: s.lateS,
        };
      }),
    };
  }
}
