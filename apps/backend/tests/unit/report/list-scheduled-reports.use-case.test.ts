import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListScheduledReportsUseCase } from '../../../src/modules/report/application/use-cases/list-scheduled-reports.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function makeSut() {
  const scheduledReportRepo: IScheduledReportRepository = {
    findById: vi.fn(),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
  };

  const useCase = new ListScheduledReportsUseCase(scheduledReportRepo);
  return { scheduledReportRepo, useCase };
}

function makeScheduledReport(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * 1',
    deliveryEmail: 'test@example.com',
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date(now.getTime() + 86400000),
    createdByUserId: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    clUserPermissions: [],
    ...overrides,
  };
}

describe('ListScheduledReportsUseCase', () => {
  let scheduledReportRepo: IScheduledReportRepository;
  let useCase: ListScheduledReportsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduledReportRepo = sut.scheduledReportRepo;
    useCase = sut.useCase;
  });

  it('should return paginated scheduled reports for AM', async () => {
    const entity = makeScheduledReport();
    vi.mocked(scheduledReportRepo.findAll).mockResolvedValue([entity]);
    vi.mocked(scheduledReportRepo.count).mockResolvedValue(1);

    const result = await useCase.execute({ page: 1, pageSize: 20 }, makeAuth());

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe('sched-1');
    expect(result.meta.total).toBe(1);
  });

  it('should scope by tenant for OP', async () => {
    vi.mocked(scheduledReportRepo.findAll).mockResolvedValue([]);
    vi.mocked(scheduledReportRepo.count).mockResolvedValue(0);

    await useCase.execute({ page: 1, pageSize: 20 }, makeAuth({ role: 'OP', tenantId: 'tenant-1' }));

    expect(scheduledReportRepo.findAll).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      1,
      20,
    );
  });

  it('should not scope by tenant for AM (sees all)', async () => {
    vi.mocked(scheduledReportRepo.findAll).mockResolvedValue([]);
    vi.mocked(scheduledReportRepo.count).mockResolvedValue(0);

    await useCase.execute({ page: 1, pageSize: 20 }, makeAuth({ role: 'AM', tenantId: null }));

    expect(scheduledReportRepo.findAll).toHaveBeenCalledWith({}, 1, 20);
  });

  it('should reject CL_ADMIN', async () => {
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
    await expect(useCase.execute({ page: 1, pageSize: 20 }, auth)).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER', async () => {
    const auth = makeAuth({ role: 'CL_USER', tenantId: 'tenant-1' });
    await expect(useCase.execute({ page: 1, pageSize: 20 }, auth)).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP', async () => {
    const auth = makeAuth({ role: 'INSP' });
    await expect(useCase.execute({ page: 1, pageSize: 20 }, auth)).rejects.toThrow(ForbiddenError);
  });
});
