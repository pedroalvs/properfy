import type { AuthContext, DayPlanResponse } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import { dayPlanNotFound, inspectorNotFound } from '../../domain/day-plan.errors';
import { configuredOriginFor, fingerprintForCandidates } from '../day-plan-inputs';
import { buildDayPlanResponse } from '../day-plan-response.builder';

export interface GetDayPlanForOperatorInput {
  actor: AuthContext;
  inspectorId: string;
  date: string;
  now?: Date;
}

/**
 * AM/OP read of any inspector's plan. Never calls the routing provider: the
 * stored plan is returned as-is, with its status reported as STALE when the
 * current fingerprint diverges (L-F04-04 status join applies in the repository).
 * DRAFT plans are visible to AM/OP.
 */
export class GetDayPlanForOperatorUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly authorization: AuthorizationService,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetDayPlanForOperatorInput): Promise<DayPlanResponse> {
    this.authorization.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'day_plan.view',
      entityType: 'DayPlan',
    });

    const now = input.now ?? this.clock.now();
    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    if (!inspector) throw inspectorNotFound();

    const plan = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    if (!plan) throw dayPlanNotFound();

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);
    const configured = configuredOriginFor(plan, inspector);
    const currentFp = fingerprintForCandidates(candidates, configured);

    // Report STALE when the fingerprint diverges, without recomputing.
    const reported =
      plan.status !== 'STALE' && plan.inputFingerprint !== currentFp ? { ...plan, status: 'STALE' as const } : plan;

    return buildDayPlanResponse(reported, candidates, inspector, now, input.date === todayCivil);
  }
}
