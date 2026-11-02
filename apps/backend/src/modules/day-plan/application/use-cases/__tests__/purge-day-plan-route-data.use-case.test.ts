import { describe, it, expect, vi } from 'vitest';
import { PurgeDayPlanRouteDataUseCase } from '../purge-day-plan-route-data.use-case';
import type { IDayPlanRepository } from '../../../domain/day-plan.repository';
import type { Logger } from '../../../../../shared/infrastructure/logger';

// 2026-11-05 00:30 UTC = 2026-11-05 11:30 Sydney (AEDT). Deterministic "today".
const FIXED = new Date('2026-11-05T00:30:00.000Z');

function makeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
}

describe('PurgeDayPlanRouteDataUseCase', () => {
  it('purges route data for plans before today in the platform timezone', async () => {
    const repo = { purgePastRouteData: vi.fn().mockResolvedValue(3) };
    const logger = makeLogger();
    const useCase = new PurgeDayPlanRouteDataUseCase(
      repo as unknown as IDayPlanRepository,
      logger,
      { now: () => FIXED },
    );

    const result = await useCase.execute();

    expect(repo.purgePastRouteData).toHaveBeenCalledWith('2026-11-05');
    expect(result).toEqual({ purged: 3 });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ purged: 3, before: '2026-11-05' }),
      'day_plan.purge_route_data',
    );
  });

  it('reports zero when nothing needs purging', async () => {
    const repo = { purgePastRouteData: vi.fn().mockResolvedValue(0) };
    const useCase = new PurgeDayPlanRouteDataUseCase(
      repo as unknown as IDayPlanRepository,
      makeLogger(),
      { now: () => FIXED },
    );
    expect(await useCase.execute()).toEqual({ purged: 0 });
  });
});
