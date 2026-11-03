import { describe, it, expect, vi } from 'vitest';
import { ClearStoredRouteDataUseCase } from '../clear-stored-route-data.use-case';

describe('ClearStoredRouteDataUseCase', () => {
  it('delegates to the repository and logs the count', async () => {
    const repo = { clearStoredRouteData: vi.fn().mockResolvedValue(3) };
    const logger = { info: vi.fn() };
    const result = await new ClearStoredRouteDataUseCase(repo, logger as never).execute();
    expect(result).toEqual({ cleared: 3 });
    expect(repo.clearStoredRouteData).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ cleared: 3 }, 'day_plan.cleared_stored_route_data');
  });
});
