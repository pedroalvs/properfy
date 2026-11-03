import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';

/**
 * Transitional one-shot (F04 Plan B, 072): nulls any routing result stored under Plan A
 * (`route_geometry`, `routing_matrix_json`, `leg_travel_json`) so no Mapbox data lingers.
 * Idempotent: a no-op once cleared. The columns themselves are dropped in PR-C.
 */
export class ClearStoredRouteDataUseCase {
  constructor(
    private readonly repo: Pick<IDayPlanRepository, 'clearStoredRouteData'>,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ cleared: number }> {
    const cleared = await this.repo.clearStoredRouteData();
    this.logger.info({ cleared }, 'day_plan.cleared_stored_route_data');
    return { cleared };
  }
}
