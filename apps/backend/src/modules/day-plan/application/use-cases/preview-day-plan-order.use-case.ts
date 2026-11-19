import type { PreviewDayPlanOrderResponse, RouteWeights } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { classifyStops, type ClassifiableStop } from '../../domain/classify-stops';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import {
  dayPlanNotFound,
  dayPlanNothingToReorder,
  dayPlanPreviewOrderMismatch,
  dayPlanVersionConflict,
} from '../../domain/day-plan.errors';
import type { PlanRouteService, PlanRouteStopInput } from '../services/plan-route.service';

export interface PreviewDayPlanOrderInput {
  inspectorId: string;
  /** Civil `YYYY-MM-DD` in the inspector's timezone. */
  date: string;
  appointmentIds: string[];
  basedOnVersion: number;
  now?: Date;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((id) => bs.has(id));
}

/**
 * Evaluates a candidate stop order for the inspector's own plan (Plan B): the travel
 * matrix is recomputed on demand and the order is evaluated over it, so the PWA can
 * preview a reorder without the raw matrix. Strictly read-only: no repository write.
 * Scope: the plan is looked up by the caller's own `inspectorId` (platform-scoped entity).
 */
export class PreviewDayPlanOrderUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly planRoute: PlanRouteService,
    private readonly clock: Clock,
  ) {}

  async execute(input: PreviewDayPlanOrderInput): Promise<PreviewDayPlanOrderResponse> {
    const now = input.now ?? this.clock.now();
    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector || !inspector.active) throw dayPlanNotFound();

    const plan = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    if (!plan) throw dayPlanNotFound();

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);
    const classifiable: ClassifiableStop[] = candidates.map((c) => ({
      appointmentId: c.appointmentId,
      appointmentStatus: c.appointmentStatus,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      abandonedAt: c.abandonedAt,
      windowStartAt: c.windowStartAt,
    }));
    const { executed, reorderable } = classifyStops(classifiable);

    if (input.basedOnVersion !== plan.version) throw dayPlanVersionConflict(plan.version);

    const reorderableIds = reorderable.map((s) => s.appointmentId);
    if (reorderableIds.length < 2) throw dayPlanNothingToReorder();
    if (!sameSet(input.appointmentIds, reorderableIds)) throw dayPlanPreviewOrderMismatch(reorderableIds);

    const byId = new Map(candidates.map((c) => [c.appointmentId, c] as const));
    const stops: PlanRouteStopInput[] = reorderableIds.map((id) => {
      const c = byId.get(id)!;
      return {
        appointmentId: c.appointmentId,
        location: c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null,
        windowStartAt: c.windowStartAt,
        windowEndAt: c.windowEndAt,
        serviceMinutes: c.durationMinutes,
      };
    });
    // A started day previews exactly what PUT /order would compute (F04-tarefas D18): the
    // not-started tail is evaluated from the last executed stop (effective LAST_STOP origin),
    // departing no earlier than that stop's end. Mirrors ComputeDayPlanUseCase.
    const lastExecuted =
      executed.length > 0 && input.date <= todayCivil ? byId.get(executed[executed.length - 1]!.appointmentId) ?? null : null;
    const useLastStop = lastExecuted !== null && lastExecuted.lat !== null && lastExecuted.lng !== null;
    const origin = useLastStop
      ? { lat: lastExecuted.lat!, lng: lastExecuted.lng! }
      : plan.originSource !== 'NONE' && plan.originLat !== null && plan.originLng !== null
        ? { lat: plan.originLat, lng: plan.originLng }
        : null;
    let earliestDepartureAt: Date | null = null;
    if (input.date === todayCivil) {
      const endOfLast = lastExecuted
        ? lastExecuted.finishedAt ??
          (lastExecuted.startedAt ? new Date(lastExecuted.startedAt.getTime() + lastExecuted.durationMinutes * 60_000) : now)
        : (plan.departureAt ?? now);
      earliestDepartureAt = new Date(Math.max(now.getTime(), endOfLast.getTime()));
    }

    const result = await this.planRoute.previewOrder({
      origin,
      stops,
      earliestDepartureAt,
      weights: plan.weights as RouteWeights,
      order: input.appointmentIds,
      now,
    });

    return {
      etaSource: 'MATRIX',
      approximate: result.approximate,
      approximateReason: result.approximateReason,
      departureAt: result.departureAt ? result.departureAt.toISOString() : null,
      finishEta: result.finishAt ? result.finishAt.toISOString() : null,
      totals: result.totals,
      feasible: result.feasible,
      violations: result.violations,
      stops: result.stops.map((s) => ({
        appointmentId: s.appointmentId,
        sequence: s.sequence,
        eta: s.arrivalAt.toISOString(),
        travelS: s.travelS,
        waitS: s.waitS,
        lateS: s.lateS,
      })),
    };
  }
}
