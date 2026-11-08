import type { AuthContext, CreateGoalInput, GoalResponse } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { AuditService } from '../../../../shared/domain/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { getCanonicalPeriod } from '../../../billing/domain/billing-period.service';
import type { IGoalRepository, IGoalScopeReader } from '../../domain/goal.repository';
import {
  GoalEndNotAlignedError,
  GoalScopeInspectorNotFoundError,
  GoalScopeRegionNotFoundError,
  GoalScopeServiceTypeNotFoundError,
  GoalStartInPastError,
  GoalStartNotAlignedError,
} from '../../domain/inspector-program.errors';
import { toGoalResponse } from '../mappers';

export interface CreateGoalInputCommand {
  data: CreateGoalInput;
  actor: AuthContext;
  requestId?: string;
}

/**
 * Create an inspector-program goal (03.6, FR-025). Validates scope existence,
 * period alignment and that the start is not before the current period, sets the
 * author, and audits `inspector_goal.created`. There is no DELETE and no
 * idempotency key (goals are not high-frequency commands).
 */
export class CreateGoalUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly scopeReader: IGoalScopeReader,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ data, actor, requestId }: CreateGoalInputCommand): Promise<GoalResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.goals.manage',
      entityType: 'InspectorGoal',
    });

    // Scope existence (P2 — the schema already enforced which scopes are allowed).
    if (data.scopeRegionId && !(await this.scopeReader.regionExists(data.scopeRegionId))) {
      throw new GoalScopeRegionNotFoundError();
    }
    if (data.scopeServiceTypeId && !(await this.scopeReader.serviceTypeExists(data.scopeServiceTypeId))) {
      throw new GoalScopeServiceTypeNotFoundError();
    }
    if (data.scopeInspectorId && !(await this.scopeReader.inspectorExists(data.scopeInspectorId))) {
      throw new GoalScopeInspectorNotFoundError();
    }

    // Period alignment (P5): start on the first day, end on the last day of a period.
    const startPeriod = getCanonicalPeriod(data.period, data.startsAt);
    if (startPeriod.periodStart !== data.startsAt) {
      throw new GoalStartNotAlignedError();
    }
    if (data.endsAt !== null) {
      const endPeriod = getCanonicalPeriod(data.period, data.endsAt);
      if (endPeriod.periodEnd !== data.endsAt) {
        throw new GoalEndNotAlignedError();
      }
    }

    // Start not before the current period (civil, PLATFORM_TIMEZONE).
    const today = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    const currentPeriodStart = getCanonicalPeriod(data.period, today).periodStart;
    if (data.startsAt < currentPeriodStart) {
      throw new GoalStartInPastError();
    }

    const goal = await this.goalRepo.create({
      title: data.title,
      metric: data.metric,
      comparator: data.comparator,
      target: data.target,
      period: data.period,
      scopeRegionId: data.scopeRegionId,
      scopeServiceTypeId: data.scopeServiceTypeId,
      scopeInspectorId: data.scopeInspectorId,
      rewardAmount: data.rewardAmount,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdByUserId: actor.userId,
    });

    this.auditService.log({
      action: 'inspector_goal.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorGoal',
      entityId: goal.id,
      requestId,
      after: {
        title: goal.title,
        metric: goal.metric,
        comparator: goal.comparator,
        target: goal.target,
        period: goal.period,
        scopeRegionId: goal.scopeRegionId,
        scopeServiceTypeId: goal.scopeServiceTypeId,
        scopeInspectorId: goal.scopeInspectorId,
        rewardAmount: goal.rewardAmount,
        startsAt: goal.startsAt,
        endsAt: goal.endsAt,
      },
    });

    return toGoalResponse(goal, { today, lastClosedPeriod: null });
  }
}
