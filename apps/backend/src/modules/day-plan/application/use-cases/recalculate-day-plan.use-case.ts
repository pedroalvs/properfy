import type { AuthContext, DayPlanResponse } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/domain/audit';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import { dayPlanDateInPast, dayPlanNotFound } from '../../domain/day-plan.errors';
import { buildDayPlanResponse } from '../day-plan-response.builder';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

export interface RecalculateDayPlanInput {
  actor: AuthContext;
  inspectorId: string;
  date: string;
  now?: Date;
}

/** The inspector "reset to suggested order" for their own plan. */
export class RecalculateDayPlanUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly compute: ComputeDayPlanUseCase,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecalculateDayPlanInput): Promise<DayPlanResponse> {
    const now = input.now ?? this.clock.now();
    if (input.actor.inspectorId !== input.inspectorId) {
      // An inspector may only recalculate their OWN plan — never another inspector's.
      throw new ForbiddenError('FORBIDDEN', 'You can only recalculate your own day plan');
    }

    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector || !inspector.active) {
      throw dayPlanNotFound();
    }

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    if (input.date < todayCivil) throw dayPlanDateInPast();

    const prev = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    if (!prev) throw dayPlanNotFound();

    const record = await this.compute.execute({
      inspectorId: input.inspectorId,
      date: input.date,
      trigger: 'MANUAL_RECALC',
      actorUserId: input.actor.userId,
      now,
    });

    this.audit.log({
      action: 'day_plan.recalculated',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'DayPlan',
      entityId: record.id,
      tenantId: null,
      metadata: { trigger: 'MANUAL_RECALC', inspectorId: input.inspectorId, date: input.date, previousVersion: prev.version, version: record.version },
    });

    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);
    const isToday = input.date === todayCivil;
    const routing = await this.compute.routingFor(record, now, isToday);
    return buildDayPlanResponse(record, candidates, inspector, now, isToday, routing);
  }
}
