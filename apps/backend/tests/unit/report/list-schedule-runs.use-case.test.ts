import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListScheduleRunsUseCase } from '../../../src/modules/report/application/use-cases/list-schedule-runs.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../../src/modules/report/domain/scheduled-report-run.repository';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import type { ScheduledReportProps } from '../../../src/modules/report/domain/scheduled-report.entity';
import { ScheduledReportRunEntity } from '../../../src/modules/report/domain/scheduled-report-run.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../../src/modules/report/domain/report.errors';
import type { AuthContext } from '@properfy/shared';

function makeSchedule(overrides: Partial<ScheduledReportProps> = {}): ScheduledReportEntity {
  return new ScheduledReportEntity({
    id: 'sched-1', tenantId: 'tenant-1', reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {}, format: 'XLSX', cronExpression: '0 8 * * 1',
    displayName: null, deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [], skipDeliveryWhenEmpty: false, consecutiveFailureCount: 0,
    status: 'ACTIVE', deletedAt: null, lastRunAt: null,
    nextRunAt: new Date(), createdByUserId: 'user-1',
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  });
}

function makeRun(id: string): ScheduledReportRunEntity {
  return new ScheduledReportRunEntity({
    id, scheduleId: 'sched-1', reportId: 'report-1', status: 'COMPLETED',
    scheduledFor: new Date(), startedAt: new Date(), completedAt: new Date(),
    errorMessage: null, recipientCount: 1, deliveryStatusJson: null,
    createdAt: new Date(), updatedAt: new Date(),
  });
}

function makeSut() {
  const scheduleRepo: IScheduledReportRepository = {
    findById: vi.fn(), findByIdIncludingDeleted: vi.fn(),
    findDueForProcessing: vi.fn().mockResolvedValue([]),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
    countActiveByOwner: vi.fn().mockResolvedValue(0), save: vi.fn(), update: vi.fn(),
  };
  const runRepo: IScheduledReportRunRepository = {
    save: vi.fn(), update: vi.fn(), findById: vi.fn(),
    findByReportId: vi.fn(), findByScheduleAndScheduledFor: vi.fn(),
    findByScheduleId: vi.fn().mockResolvedValue([]),
    countByScheduleId: vi.fn().mockResolvedValue(0),
    findLatestForSchedule: vi.fn(), findLatestForSchedules: vi.fn(),
  };
  return { scheduleRepo, runRepo, useCase: new ListScheduleRunsUseCase(scheduleRepo, runRepo) };
}

const amAuth: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, clUserPermissions: [] };

describe('ListScheduleRunsUseCase', () => {
  let scheduleRepo: IScheduledReportRepository;
  let runRepo: IScheduledReportRunRepository;
  let useCase: ListScheduleRunsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduleRepo = sut.scheduleRepo;
    runRepo = sut.runRepo;
    useCase = sut.useCase;
  });

  it('returns paginated runs with total', async () => {
    const runs = [makeRun('run-1'), makeRun('run-2')];
    vi.mocked(scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(runRepo.findByScheduleId).mockResolvedValue(runs);
    vi.mocked(runRepo.countByScheduleId).mockResolvedValue(5);

    const result = await useCase.execute({ scheduleId: 'sched-1', page: 1, pageSize: 2 }, amAuth);

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(5);
    expect(runRepo.findByScheduleId).toHaveBeenCalledWith('sched-1', 1, 2);
  });

  it('throws ScheduledReportNotFoundError when schedule is missing', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ scheduleId: 'missing', page: 1, pageSize: 10 }, amAuth),
    ).rejects.toThrow(ScheduledReportNotFoundError);
  });

  it('enforces RBAC via parent schedule', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(makeSchedule({ tenantId: 'tenant-2' }));

    const auth: AuthContext = { ...amAuth, role: 'OP', tenantId: 'tenant-1' };
    await expect(
      useCase.execute({ scheduleId: 'sched-1', page: 1, pageSize: 10 }, auth),
    ).rejects.toThrow(ScheduleForbiddenError);
  });

  it('CL_USER can list runs for own schedule', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(
      makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'cl-user-1' }),
    );
    vi.mocked(runRepo.findByScheduleId).mockResolvedValue([]);
    vi.mocked(runRepo.countByScheduleId).mockResolvedValue(0);

    const auth: AuthContext = { ...amAuth, userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' };
    const result = await useCase.execute({ scheduleId: 'sched-1', page: 1, pageSize: 10 }, auth);

    expect(result.data).toEqual([]);
  });
});
