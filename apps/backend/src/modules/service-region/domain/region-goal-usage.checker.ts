/**
 * Port that reports how many active inspector-program goals reference a region.
 *
 * Region deletion is a hard delete, so it must be blocked while an active goal
 * still scopes to the region (F08-1, FR-028). The `inspector-program` module
 * implements this port (via `IGoalRepository.countActiveByScopeRegionId`); the
 * `service-region` module depends only on this interface, keeping the dependency
 * pointing inward. It is an optional collaborator of `DeleteServiceRegionUseCase`
 * so the service-region module still builds without inspector-program.
 */
export interface IRegionGoalUsageChecker {
  /** Count of active goals that scope to `regionId`. */
  countActiveGoalsUsingRegion(regionId: string): Promise<number>;
}
