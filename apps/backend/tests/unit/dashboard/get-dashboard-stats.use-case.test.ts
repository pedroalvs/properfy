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
  },
  recentAppointments: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'APT-000000',
      propertyAddress: '1 Test St, Sydney NSW 2000',
      status: 'SCHEDULED',
      scheduledDate: '2026-03-17',
    },
  ],
  pendingActions: {
    noResponseTenants: 1,
    pendingFinancialEntries: 2,
    processingReports: 0,
  },
  quickStats: {
    totalProperties: 50,
    activeInspectors: 5,
    activeServiceGroups: 2,
  },
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

  it('should delegate to repository without tenantId for AM role', async () => {
    const result = await useCase.execute({
      actor: { userId: 'u1', tenantId: null, role: 'AM', branchId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith(undefined);
    expect(result).toEqual(mockStats);
  });

  it('should delegate to repository without tenantId for OP role', async () => {
    await useCase.execute({
      actor: { userId: 'u2', tenantId: null, role: 'OP', branchId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith(undefined);
  });

  it('should delegate to repository with tenantId for CL_ADMIN role', async () => {
    await useCase.execute({
      actor: { userId: 'u3', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null },
    });

    expect(repository.getStats).toHaveBeenCalledWith('tenant-1');
  });

  it('should delegate to repository with tenantId for CL_USER role', async () => {
    await useCase.execute({
      actor: { userId: 'u4', tenantId: 'tenant-2', role: 'CL_USER', branchId: 'b1' },
    });

    expect(repository.getStats).toHaveBeenCalledWith('tenant-2');
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute({
        actor: { userId: 'u5', tenantId: null, role: 'INSP', branchId: null },
      }),
    ).rejects.toThrow('Insufficient permissions to view dashboard stats');
  });

  it('should throw ForbiddenError for TNT role', async () => {
    await expect(
      useCase.execute({
        actor: { userId: 'u6', tenantId: null, role: 'TNT' as never, branchId: null },
      }),
    ).rejects.toThrow('Insufficient permissions to view dashboard stats');
  });
});
