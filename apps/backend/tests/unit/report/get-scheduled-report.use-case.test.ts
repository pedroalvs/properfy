import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetScheduledReportUseCase } from '../../../src/modules/report/application/use-cases/get-scheduled-report.use-case';
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
    displayName: 'My Report', deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [], skipDeliveryWhenEmpty: false, consecutiveFailureCount: 0,
    status: 'ACTIVE', deletedAt: null, lastRunAt: null,
    nextRunAt: new Date(), createdByUserId: 'user-1',
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  });
}

function makeRun(status: string): ScheduledReportRunEntity {
  return new ScheduledReportRunEntity({
    id: 'run-1', scheduleId: 'sched-1', reportId: 'report-1',
    status: status as any, scheduledFor: new Date(),
    startedAt: new Date(), completedAt: new Date(), errorMessage: null,
    recipientCount: 1, deliveryStatusJson: null,
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
    findLatestForSchedule: vi.fn().mockResolvedValue(null),
    findLatestForSchedules: vi.fn(),
  };
  return { scheduleRepo, runRepo, useCase: new GetScheduledReportUseCase(scheduleRepo, runRepo) };
}

const amAuth: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, clUserPermissions: [] };

describe('GetScheduledReportUseCase', () => {
  let scheduleRepo: IScheduledReportRepository;
  let runRepo: IScheduledReportRunRepository;
  let useCase: GetScheduledReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduleRepo = sut.scheduleRepo;
    runRepo = sut.runRepo;
    useCase = sut.useCase;
  });

  it('returns schedule with lastRunStatus from latest run', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(runRepo.findLatestForSchedule).mockResolvedValue(makeRun('COMPLETED'));

    const result = await useCase.execute('sched-1', amAuth);

    expect(result.schedule.id).toBe('sched-1');
    expect(result.lastRunStatus).toBe('COMPLETED');
  });

  it('returns null lastRunStatus when no runs exist', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(makeSchedule());
    vi.mocked(runRepo.findLatestForSchedule).mockResolvedValue(null);

    const result = await useCase.execute('sched-1', amAuth);

    expect(result.lastRunStatus).toBeNull();
  });

  it('throws ScheduledReportNotFoundError when schedule is missing', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute('missing', amAuth)).rejects.toThrow(ScheduledReportNotFoundError);
  });

  it('CL_ADMIN can access within own tenant', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(makeSchedule({ tenantId: 'tenant-1' }));
    vi.mocked(runRepo.findLatestForSchedule).mockResolvedValue(null);

    const auth: AuthContext = { ...amAuth, role: 'CL_ADMIN', tenantId: 'tenant-1' };
    const result = await useCase.execute('sched-1', auth);

    expect(result.schedule).toBeDefined();
  });

  it('CL_USER cannot access another user schedule', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(
      makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'other-user' }),
    );

    const auth: AuthContext = { ...amAuth, userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' };
    await expect(useCase.execute('sched-1', auth)).rejects.toThrow(ScheduleForbiddenError);
  });
});
