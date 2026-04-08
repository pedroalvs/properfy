import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessSchedulesWorker } from '../../../src/modules/report/infrastructure/workers/process-schedules.worker';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { RequestReportUseCase } from '../../../src/modules/report/application/use-cases/request-report.use-case';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function makeSchedule(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * 1',
    deliveryEmail: 'reports@example.com',
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date(now.getTime() - 60000), // 1 minute ago (due)
    createdByUserId: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeSut() {
  const scheduledReportRepo: IScheduledReportRepository = {
    findById: vi.fn(),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
  };

  const requestReportUseCase = {
    execute: vi.fn().mockResolvedValue({
      reportId: 'report-1',
      status: 'PENDING',
      reportType: 'INSPECTIONS_SCHEDULED',
      createdAt: new Date(),
    }),
  } as unknown as RequestReportUseCase;

  const logger = makeLogger();

  const worker = new ProcessSchedulesWorker(scheduledReportRepo, requestReportUseCase, logger);
  return { scheduledReportRepo, requestReportUseCase, logger, worker };
}

describe('ProcessSchedulesWorker', () => {
  let scheduledReportRepo: IScheduledReportRepository;
  let requestReportUseCase: RequestReportUseCase;
  let logger: Logger;
  let worker: ProcessSchedulesWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduledReportRepo = sut.scheduledReportRepo;
    requestReportUseCase = sut.requestReportUseCase;
    logger = sut.logger;
    worker = sut.worker;
  });

  it('should return zero counts when no due schedules exist', async () => {
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([]);

    const result = await worker.execute();

    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('should process due schedule and call RequestReportUseCase', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([schedule]);

    const result = await worker.execute();

    expect(result.processedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(requestReportUseCase.execute).toHaveBeenCalledOnce();
    expect(scheduledReportRepo.update).toHaveBeenCalledOnce();
  });

  it('should update lastRunAt and nextRunAt after processing', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([schedule]);

    await worker.execute();

    expect(schedule.lastRunAt).not.toBeNull();
    expect(schedule.nextRunAt).not.toBeNull();
    expect(scheduledReportRepo.update).toHaveBeenCalledWith(schedule);
  });

  it('should pass tenant context in auth when calling RequestReportUseCase', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-42' });
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([schedule]);

    await worker.execute();

    expect(requestReportUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'INSPECTIONS_SCHEDULED',
        format: 'XLSX',
        filters: expect.objectContaining({
          tenantId: 'tenant-42',
        }),
      }),
      expect.objectContaining({
        userId: 'user-1',
        tenantId: 'tenant-42',
        role: 'AM',
      }),
    );
  });

  it('should increment failedCount when RequestReportUseCase throws', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([schedule]);
    vi.mocked(requestReportUseCase.execute as any).mockRejectedValueOnce(new Error('boom'));

    const result = await worker.execute();

    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should process multiple schedules independently', async () => {
    const sched1 = makeSchedule({ id: 'sched-1' });
    const sched2 = makeSchedule({ id: 'sched-2' });
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([sched1, sched2]);

    const result = await worker.execute();

    expect(result.processedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(requestReportUseCase.execute).toHaveBeenCalledTimes(2);
    expect(scheduledReportRepo.update).toHaveBeenCalledTimes(2);
  });

  it('should use rangeDays from filtersJson when available', async () => {
    const schedule = makeSchedule({ filtersJson: { rangeDays: 7 } });
    vi.mocked(scheduledReportRepo.findDueSchedules).mockResolvedValue([schedule]);

    await worker.execute();

    const callArgs = vi.mocked(requestReportUseCase.execute as any).mock.calls[0]![0];
    const fromDate = new Date(callArgs.filters.fromDate);
    const toDate = new Date(callArgs.filters.toDate);
    const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });
});
