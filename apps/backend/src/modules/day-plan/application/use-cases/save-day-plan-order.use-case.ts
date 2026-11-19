import type { DayPlanResponse } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/domain/audit';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { classifyStops, type ClassifiableStop } from '../../domain/classify-stops';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import {
  dayPlanDateInPast,
  dayPlanNotFound,
  dayPlanOrderMismatch,
  dayPlanStale,
  dayPlanVersionConflict,
} from '../../domain/day-plan.errors';
import { configuredOriginFor, fingerprintForCandidates } from '../day-plan-inputs';
import { buildDayPlanResponse } from '../day-plan-response.builder';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

export interface SaveDayPlanOrderInput {
  inspectorId: string;
  actorUserId: string;
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

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export class SaveDayPlanOrderUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly compute: ComputeDayPlanUseCase,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async execute(input: SaveDayPlanOrderInput): Promise<DayPlanResponse> {
    const now = input.now ?? this.clock.now();
    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector || !inspector.active) throw dayPlanNotFound();

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    if (input.date < todayCivil) throw dayPlanDateInPast();

    const plan = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    if (!plan) throw dayPlanNotFound();

    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);
    const classifiable: ClassifiableStop[] = candidates.map((c) => ({
      appointmentId: c.appointmentId,
      appointmentStatus: c.appointmentStatus,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      abandonedAt: c.abandonedAt,
      windowStartAt: c.windowStartAt,
    }));
    const { reorderable } = classifyStops(classifiable);
    const reorderableIds = reorderable.map((s) => s.appointmentId);

    const configured = configuredOriginFor(plan, inspector);
    const currentFp = fingerprintForCandidates(candidates, configured);
    if (plan.status === 'STALE' || plan.inputFingerprint !== currentFp) throw dayPlanStale();

    const storedOrder = plan.stops
      .filter((s) => !s.executed)
      .sort((x, y) => x.sequence - y.sequence)
      .map((s) => s.appointmentId);

    if (input.basedOnVersion !== plan.version) {
      // Idempotent replay: the saved manual order already equals the request.
      if (plan.manualOrder && sameOrder(storedOrder, input.appointmentIds)) {
        return await this.build(plan, candidates, inspector, now, input.date === todayCivil);
      }
      throw dayPlanVersionConflict(plan.version);
    }

    if (!sameSet(input.appointmentIds, reorderableIds)) {
      throw dayPlanOrderMismatch(reorderableIds);
    }

    const record = await this.compute.execute({
      inspectorId: input.inspectorId,
      date: input.date,
      trigger: 'REORDER',
      actorUserId: input.actorUserId,
      fixedOrder: input.appointmentIds,
      now,
    });

    this.audit.log({
      action: 'day_plan.reordered',
      actorType: 'USER',
      actorId: input.actorUserId,
      entityType: 'DayPlan',
      entityId: record.id,
      tenantId: null,
      before: { order: storedOrder },
      after: { order: input.appointmentIds },
      metadata: { feasible: record.feasible, lateS: record.totalLateS, date: input.date },
    });

    return await this.build(record, candidates, inspector, now, input.date === todayCivil);
  }

  private async build(
    record: DayPlanRecord,
    candidates: Awaited<ReturnType<IDayPlanInputReader['loadCandidates']>>,
    inspector: NonNullable<Awaited<ReturnType<IDayPlanInputReader['loadInspectorContext']>>>,
    now: Date,
    isToday: boolean,
  ): Promise<DayPlanResponse> {
    const routing = await this.compute.routingFor(record, now, isToday);
    return buildDayPlanResponse(record, candidates, inspector, now, isToday, routing);
  }
}
