import type { AuthContext, GoalResponse, ListGoalsQuery } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { IGoalRepository } from '../../domain/goal.repository';
import { toGoalResponse } from '../mappers';

export interface ListGoalsCommand {
  actor: AuthContext;
  query: ListGoalsQuery;
}

/**
 * Paginated AM/OP list of goals (03.6, FR-038). Maps each goal with its scope
 * names; `lastClosedPeriod` is omitted here (null) to avoid a per-row closure
 * query — the detail endpoint resolves it.
 */
export class ListGoalsUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ actor, query }: ListGoalsCommand): Promise<{ data: GoalResponse[]; total: number }> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.goals.manage',
      entityType: 'InspectorGoal',
    });

    const { data, total } = await this.goalRepo.list({
      active: query.active,
      metric: query.metric,
      period: query.period,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const today = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    return {
      data: data.map((goal) => toGoalResponse(goal, { today, lastClosedPeriod: null })),
      total,
    };
  }
}
