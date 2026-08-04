import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  GetDashboardAnalyticsUseCase,
  WEEKLY_GRANULARITY_THRESHOLD_DAYS,
} from '../../../src/modules/dashboard/application/use-cases/get-dashboard-analytics.use-case';
import type { DashboardAnalyticsRepository } from '../../../src/modules/dashboard/domain/dashboard-analytics.repository';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: '33333333-3333-4333-8333-333333333333',
    tenantId: TENANT_ID,
    role: 'AM',
    email: 'am@properfy.test',
    ...overrides,
  } as AuthContext;
}

describe('GetDashboardAnalyticsUseCase', () => {
  let repository: { getAnalytics: ReturnType<typeof vi.fn> };
  let useCase: GetDashboardAnalyticsUseCase;

  beforeEach(() => {
    repository = { getAnalytics: vi.fn().mockResolvedValue({ ok: true }) };
    useCase = new GetDashboardAnalyticsUseCase(repository as unknown as DashboardAnalyticsRepository);
  });

  const query = { startDate: '2026-07-01', endDate: '2026-07-31' };

  describe('role gate', () => {
    it.each(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('allows %s', async (role) => {
      await expect(useCase.execute({ actor: makeActor({ role: role as AuthContext['role'] }), query })).resolves.toBeDefined();
    });

    it.each(['INSP', 'TNT'])('rejects %s', async (role) => {
      await expect(
        useCase.execute({ actor: makeActor({ role: role as AuthContext['role'] }), query }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.getAnalytics).not.toHaveBeenCalled();
    });
  });

  describe('tenant scoping', () => {
    it.each(['AM', 'OP'])('leaves %s unscoped so the aggregation spans every agency', async (role) => {
      await useCase.execute({ actor: makeActor({ role: role as AuthContext['role'] }), query });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ tenantId: undefined }));
    });

    it.each(['CL_ADMIN', 'CL_USER'])('pins %s to its own tenant', async (role) => {
      await useCase.execute({
        actor: makeActor({ role: role as AuthContext['role'], clUserPermissions: ['view_financials'] }),
        query,
      });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }));
    });

    it.each(['CL_ADMIN', 'CL_USER'])(
      'rejects %s whose context carries no tenant instead of widening the scope',
      async (role) => {
        // `actor.tenantId ?? undefined` reads identically to "AM/OP, no filter"
        // downstream, so failing open here would hand an agency actor
        // platform-wide totals, revenue and suburb density.
        await expect(
          useCase.execute({ actor: makeActor({ role: role as AuthContext['role'], tenantId: null }), query }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(repository.getAnalytics).not.toHaveBeenCalled();
      },
    );

    it('still leaves AM unscoped when its context has no tenant — that is the normal case', async () => {
      await useCase.execute({ actor: makeActor({ role: 'AM', tenantId: null }), query });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ tenantId: undefined }));
    });

    it('never takes the tenant from the query — only from the auth context', async () => {
      await useCase.execute({
        actor: makeActor({ role: 'CL_ADMIN' }),
        query: { ...query, tenantId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } as never,
      });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }));
    });
  });

  describe('revenue gating', () => {
    it.each(['AM', 'OP', 'CL_ADMIN'])('includes revenue for %s', async (role) => {
      await useCase.execute({ actor: makeActor({ role: role as AuthContext['role'] }), query });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ includeRevenue: true }));
    });

    it('includes revenue for a CL_USER holding view_financials', async () => {
      await useCase.execute({
        actor: makeActor({ role: 'CL_USER', clUserPermissions: ['view_financials'] }),
        query,
      });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ includeRevenue: true }));
    });

    it('omits revenue — without throwing — for a CL_USER lacking view_financials', async () => {
      await expect(
        useCase.execute({ actor: makeActor({ role: 'CL_USER', clUserPermissions: ['create_appointments'] }), query }),
      ).resolves.toBeDefined();
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ includeRevenue: false }));
    });

    it('omits revenue for a CL_USER with no permission array at all', async () => {
      await useCase.execute({ actor: makeActor({ role: 'CL_USER', clUserPermissions: undefined }), query });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ includeRevenue: false }));
    });
  });

  describe('granularity', () => {
    it('keeps daily buckets at exactly the threshold', async () => {
      // A period of exactly WEEKLY_GRANULARITY_THRESHOLD_DAYS days, inclusive.
      const endDate = new Date(Date.UTC(2026, 6, 1));
      endDate.setUTCDate(endDate.getUTCDate() + WEEKLY_GRANULARITY_THRESHOLD_DAYS - 1);
      await useCase.execute({
        actor: makeActor(),
        query: { startDate: '2026-07-01', endDate: endDate.toISOString().slice(0, 10) },
      });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'day' }));
    });

    it('widens to weekly buckets one day past the threshold', async () => {
      const endDate = new Date(Date.UTC(2026, 6, 1));
      endDate.setUTCDate(endDate.getUTCDate() + WEEKLY_GRANULARITY_THRESHOLD_DAYS);
      await useCase.execute({
        actor: makeActor(),
        query: { startDate: '2026-07-01', endDate: endDate.toISOString().slice(0, 10) },
      });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'week' }));
    });

    it('treats a single-day period as daily', async () => {
      await useCase.execute({ actor: makeActor(), query: { startDate: '2026-07-05', endDate: '2026-07-05' } });
      expect(repository.getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'day' }));
    });
  });

  it('passes the period through untouched', async () => {
    await useCase.execute({ actor: makeActor(), query });
    expect(repository.getAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-07-01', endDate: '2026-07-31' }),
    );
  });
});
