import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type {
  IRewardAwardRepository,
  RewardAwardListFilter,
  RewardAwardWithRelations,
} from '../../domain/reward-award.repository';

/** AM/OP list of reward awards (03.13). RBAC is enforced before any read. */
export class ListRewardAwardsUseCase {
  constructor(
    private readonly rewardRepo: IRewardAwardRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(
    actor: AuthContext,
    filter: RewardAwardListFilter,
  ): Promise<{ data: RewardAwardWithRelations[]; total: number }> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      entityType: 'RewardAward',
      action: 'inspector_program.awards.view',
    });
    return this.rewardRepo.list(filter);
  }
}
