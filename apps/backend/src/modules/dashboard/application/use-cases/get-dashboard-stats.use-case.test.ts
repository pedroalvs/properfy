import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDashboardStatsUseCase } from './get-dashboard-stats.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { DashboardRepository } from '../../domain/dashboard.repository';
import type { AuthContext, UserRole } from '@properfy/shared';

const makeBreakdowns = () => ({
  tomorrowByInspector: [
    { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 18, alertLevel: 'red' as const },
  ],
  scheduledThisWeekByInspector: [
    { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 25, alertLevel: null },
  ],
  confirmedThisWeekByInspector: [
    { inspectorId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22', inspectorName: 'Bob', count: 12, alertLevel: null },
  ],
});

const makeBaseStats = (inspectorBreakdowns: ReturnType<typeof makeBreakdowns> | null) => ({
  appointmentsByStatus: {
    draft: 5,
    awaitingInspector: 8,
    scheduled: 12,
    doneThisMonth: 34,
    doneThisWeek: 7,
    scheduledThisWeek: 10,
    rejectedTotal: 3,
  },
  recentAppointments: [],
  pendingActions: {
    noResponseRentalTenants: 1,
    pendingOperatorCrossChecks: 2,
    pendingFinancialEntries: 3,
    processingReports: 0,
  },
  quickStats: {
    totalProperties: 100,
    activeInspectors: 10,
    activeServiceGroups: 5,
  },
  inspectorBreakdowns,
});

const makeActor = (role: string, tenantId: string | null = null): AuthContext => ({
  userId: 'user-1',
  tenantId,
  role: role as UserRole,
  branchId: null,
  inspectorId: null,
});

describe('GetDashboardStatsUseCase', () => {
  let mockRepository: { getStats: ReturnType<typeof vi.fn> };
  let useCase: GetDashboardStatsUseCase;

  beforeEach(() => {
    mockRepository = { getStats: vi.fn() };
    useCase = new GetDashboardStatsUseCase(mockRepository as unknown as DashboardRepository);
  });

  describe('AM role', () => {
    it('calls repository with includeInspectorBreakdowns=true', async () => {
      const breakdowns = makeBreakdowns();
      mockRepository.getStats.mockResolvedValue(makeBaseStats(breakdowns));

      await useCase.execute({ actor: makeActor('AM') });

      expect(mockRepository.getStats).toHaveBeenCalledWith(undefined, true);
    });

    it('returns populated inspectorBreakdowns', async () => {
      const breakdowns = makeBreakdowns();
      mockRepository.getStats.mockResolvedValue(makeBaseStats(breakdowns));

      const result = await useCase.execute({ actor: makeActor('AM') });

      expect(result.inspectorBreakdowns).toEqual(breakdowns);
    });

    it('passes undefined as tenantId for unscoped access', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(makeBreakdowns()));

      await useCase.execute({ actor: makeActor('AM') });

      const [tenantId] = mockRepository.getStats.mock.calls[0]!;
      expect(tenantId).toBeUndefined();
    });
  });

  describe('OP role', () => {
    it('calls repository with includeInspectorBreakdowns=true', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(makeBreakdowns()));

      await useCase.execute({ actor: makeActor('OP') });

      expect(mockRepository.getStats).toHaveBeenCalledWith(undefined, true);
    });

    it('returns populated inspectorBreakdowns', async () => {
      const breakdowns = makeBreakdowns();
      mockRepository.getStats.mockResolvedValue(makeBaseStats(breakdowns));

      const result = await useCase.execute({ actor: makeActor('OP') });

      expect(result.inspectorBreakdowns).toEqual(breakdowns);
    });
  });

  describe('CL_ADMIN role', () => {
    it('calls repository with includeInspectorBreakdowns=false', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(null));

      await useCase.execute({ actor: makeActor('CL_ADMIN', 'tenant-1') });

      expect(mockRepository.getStats).toHaveBeenCalledWith('tenant-1', false);
    });

    it('returns inspectorBreakdowns: null', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(null));

      const result = await useCase.execute({ actor: makeActor('CL_ADMIN', 'tenant-1') });

      expect(result.inspectorBreakdowns).toBeNull();
    });

    it('passes actor.tenantId for tenant-scoped access', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(null));

      await useCase.execute({ actor: makeActor('CL_ADMIN', 'my-tenant-id') });

      const [tenantId] = mockRepository.getStats.mock.calls[0]!;
      expect(tenantId).toBe('my-tenant-id');
    });
  });

  describe('CL_USER role', () => {
    it('calls repository with includeInspectorBreakdowns=false', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(null));

      await useCase.execute({ actor: makeActor('CL_USER', 'tenant-1') });

      expect(mockRepository.getStats).toHaveBeenCalledWith('tenant-1', false);
    });

    it('returns inspectorBreakdowns: null', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(null));

      const result = await useCase.execute({ actor: makeActor('CL_USER', 'tenant-1') });

      expect(result.inspectorBreakdowns).toBeNull();
    });
  });

  describe('forbidden roles', () => {
    it('throws ForbiddenError for INSP', async () => {
      await expect(
        useCase.execute({ actor: makeActor('INSP') }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ForbiddenError for TNT', async () => {
      await expect(
        useCase.execute({ actor: makeActor('TNT') }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('new scalar fields', () => {
    it('returns doneThisWeek, scheduledThisWeek, rejectedTotal from repository output', async () => {
      mockRepository.getStats.mockResolvedValue(makeBaseStats(makeBreakdowns()));

      const result = await useCase.execute({ actor: makeActor('AM') });

      expect(result.appointmentsByStatus.doneThisWeek).toBe(7);
      expect(result.appointmentsByStatus.scheduledThisWeek).toBe(10);
      expect(result.appointmentsByStatus.rejectedTotal).toBe(3);
    });
  });
});
