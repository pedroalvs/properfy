import type { IRegionGoalUsageChecker } from '../../service-region/domain/region-goal-usage.checker';
import type { IGoalRepository } from '../domain/goal.repository';

/**
 * Implements the service-region region-deletion guard port (FR-028) by counting
 * active goals scoped to the region via `IGoalRepository.countActiveByScopeRegionId`.
 * Wired into `DeleteServiceRegionUseCase` as its optional trailing collaborator.
 */
export class RegionGoalUsageChecker implements IRegionGoalUsageChecker {
  constructor(private readonly goalRepo: IGoalRepository) {}

  countActiveGoalsUsingRegion(regionId: string): Promise<number> {
    return this.goalRepo.countActiveByScopeRegionId(regionId);
  }
}
