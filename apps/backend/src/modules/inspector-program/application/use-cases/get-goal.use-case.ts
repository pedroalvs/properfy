import type { AuthContext, GoalResponse } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { IGoalPeriodClosureRepository } from '../../domain/goal-period-closure.repository';
import type { IGoalRepository } from '../../domain/goal.repository';
import { GoalNotFoundError } from '../../domain/inspector-program.errors';
import { toGoalResponse } from '../mappers';

export interface GetGoalCommand {
  goalId: string;
  actor: AuthContext;
}

/** AM/OP goal detail (FR-038), including the goal's last closed period. */
export class GetGoalUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly closureRepo: IGoalPeriodClosureRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ goalId, actor }: GetGoalCommand): Promise<GoalResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.goals.manage',
      entityType: 'InspectorGoal',
    });

    const goal = await this.goalRepo.findById(goalId);
    if (!goal) throw new GoalNotFoundError();

    const lastClosedPeriod = await this.closureRepo.lastClosedByGoalId(goalId);
    const today = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    return toGoalResponse(goal, { today, lastClosedPeriod });
  }
}
