import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { GetAnalyticsHeatmapUseCase } from '../../../src/modules/dashboard/application/use-cases/get-analytics-heatmap.use-case';
import type { DashboardAnalyticsRepository } from '../../../src/modules/dashboard/domain/dashboard-analytics.repository';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';

function makeActor(role: string): AuthContext {
  return {
    userId: '33333333-3333-4333-8333-333333333333',
    tenantId: TENANT_ID,
    role,
    email: 'user@properfy.test',
  } as AuthContext;
}

describe('GetAnalyticsHeatmapUseCase', () => {
  let repository: { getHeatmap: ReturnType<typeof vi.fn> };
  let useCase: GetAnalyticsHeatmapUseCase;
  const query = { startDate: '2026-07-01', endDate: '2026-07-31' };

  beforeEach(() => {
    repository = {
      getHeatmap: vi.fn().mockResolvedValue({ points: [], totalPlotted: 0, totalWithoutCoordinates: 0 }),
    };
    useCase = new GetAnalyticsHeatmapUseCase(repository as unknown as DashboardAnalyticsRepository);
  });

  it.each(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s', async (role) => {
    await expect(useCase.execute({ actor: makeActor(role), query })).resolves.toBeDefined();
  });

  it.each(['INSP', 'TNT'])('rejects %s', async (role) => {
    await expect(useCase.execute({ actor: makeActor(role), query })).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.getHeatmap).not.toHaveBeenCalled();
  });

  it.each(['AM', 'OP'])('leaves %s unscoped', async (role) => {
    await useCase.execute({ actor: makeActor(role), query });
    expect(repository.getHeatmap).toHaveBeenCalledWith(expect.objectContaining({ tenantId: undefined }));
  });

  it.each(['CL_ADMIN', 'CL_USER'])('pins %s to its own tenant', async (role) => {
    await useCase.execute({ actor: makeActor(role), query });
    expect(repository.getHeatmap).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }));
  });

  it('passes the period through untouched', async () => {
    await useCase.execute({ actor: makeActor('OP'), query });
    expect(repository.getHeatmap).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-07-01', endDate: '2026-07-31' }),
    );
  });
});
