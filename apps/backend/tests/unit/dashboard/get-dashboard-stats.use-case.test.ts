import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDashboardStatsUseCase } from '../../../src/modules/dashboard/application/use-cases/get-dashboard-stats.use-case';
import type { DashboardRepository } from '../../../src/modules/dashboard/domain/dashboard.repository';
import type { DashboardStatsOutput } from '../../../src/modules/dashboard/application/use-cases/get-dashboard-stats.use-case';

const mockStats: DashboardStatsOutput = {
  appointmentsByStatus: {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 5,
    doneThisMonth: 10,
    doneThisWeek: 3,
    scheduledThisWeek: 4,
    rejectedTotal: 1,
  },
  recentAppointments: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'SPS-001',
      propertyAddress: '1 Test St, Sydney NSW 2000',
      status: 'SCHEDULED',
      doneCheckedByUserId: null,
      scheduledDate: '2026-03-17',
    },
  ],
  pendingActions: {
    noResponseRentalTenants: 1,
    pendingOperatorCrossChecks: 4,
    pendingFinancialEntries: 2,
    processingReports: 0,
  },
  quickStats: {
    totalProperties: 50,
    activeInspectors: 5,
    activeServiceGroups: 2,
  },
  inspectorBreakdowns: null,
};

describe('GetDashboardStatsUseCase', () => {
  let repository: DashboardRepository;
  let useCase: GetDashboardStatsUseCase;

  beforeEach(() => {
    repository = {
      getStats: vi.fn().mockResolvedValue(mockStats),
    };
    useCase = new GetDashboardStatsUseCase(repository);
  });

  it('should delegate to repository without tenantId and with breakdowns=true for AM role', async () => {
    const result = await useCase.execute({
      actor: { userId: 'u1', tenantId: null, role: 'AM', branchId: null, inspectorId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith(undefined, true);
    expect(result).toEqual(mockStats);
  });

  it('should delegate to repository without tenantId and with breakdowns=true for OP role', async () => {
    await useCase.execute({
      actor: { userId: 'u2', tenantId: null, role: 'OP', branchId: null, inspectorId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith(undefined, true);
  });

  it('should delegate to repository with tenantId and breakdowns=false for CL_ADMIN role', async () => {
    await useCase.execute({
      actor: { userId: 'u3', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith('tenant-1', false);
  });

  it('should delegate to repository with tenantId and breakdowns=false for CL_USER role', async () => {
    await useCase.execute({
      actor: { userId: 'u4', tenantId: 'tenant-2', role: 'CL_USER', branchId: 'b1', inspectorId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith('tenant-2', false);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        actor: { userId: 'u5', tenantId: null, role: 'INSP', branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow('Insufficient permissions to view dashboard stats');
  });

  it('should throw ForbiddenError for TNT role', async () => {
    await expect(
      useCase.execute({
        actor: { userId: 'u6', tenantId: null, role: 'TNT' as never, branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow('Insufficient permissions to view dashboard stats');
  });
});
