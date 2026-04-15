import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessSchedulesWorker } from '../../../src/modules/report/infrastructure/workers/process-schedules.worker';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../../src/modules/report/domain/scheduled-report-run.repository';
import type { RequestReportUseCase } from '../../../src/modules/report/application/use-cases/request-report.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import {
  ReportConcurrentLimitExceededError,
  ReportDateRangeExceededError,
} from '../../../src/modules/report/domain/report.errors';
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

function makeUser(overrides: Partial<ConstructorParameters<typeof UserEntity>[0]> = {}) {
  const now = new Date();
  return new UserEntity({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    role: 'OP',
    name: 'Op User',
    email: 'op@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hash',
    totpEnabled: false,
    totpSecretCiphertext: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as any);
}

function makeSchedule(
  overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {},
) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *', // daily at 08:00
    deliveryEmail: 'reports@example.com',
    displayName: null,
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
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
    findByIdIncludingDeleted: vi.fn(),
    findDueForProcessing: vi.fn().mockResolvedValue([]),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    countActiveByOwner: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
  };

  const scheduledReportRunRepo: IScheduledReportRunRepository = {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByReportId: vi.fn(),
    findByScheduleAndScheduledFor: vi.fn().mockResolvedValue(null),
    findByScheduleId: vi.fn().mockResolvedValue([]),
    countByScheduleId: vi.fn().mockResolvedValue(0),
    findLatestForSchedule: vi.fn(),
    findLatestForSchedules: vi.fn().mockResolvedValue(new Map()),
  };

  const requestReportUseCase = {
    execute: vi.fn().mockResolvedValue({
      reportId: 'report-1',
      status: 'PENDING',
      reportType: 'INSPECTIONS_SCHEDULED',
      createdAt: new Date(),
    }),
  } as unknown as RequestReportUseCase;

  const userManagementRepo: IUserManagementRepository = {
    findById: vi.fn().mockResolvedValue(makeUser()),
    findByIdAndTenantId: vi.fn(),
    findByEmail: vi.fn(),
    findByTenantId: vi.fn(),
    countByTenantId: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    unlock: vi.fn(),
    revokeAllSessions: vi.fn(),
  };

  const auditService: AuditService = { log: vi.fn() };
  const logger = makeLogger();

  const worker = new ProcessSchedulesWorker(
    scheduledReportRepo,
    scheduledReportRunRepo,
    requestReportUseCase,
    userManagementRepo,
    auditService,
    logger,
  );
  return {
    scheduledReportRepo,
    scheduledReportRunRepo,
    requestReportUseCase,
    userManagementRepo,
    auditService,
    logger,
    worker,
  };
}

describe('ProcessSchedulesWorker (feature 019 reshape)', () => {
  let scheduledReportRepo: IScheduledReportRepository;
  let scheduledReportRunRepo: IScheduledReportRunRepository;
  let requestReportUseCase: RequestReportUseCase;
  let userManagementRepo: IUserManagementRepository;
  let auditService: AuditService;
  let worker: ProcessSchedulesWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduledReportRepo = sut.scheduledReportRepo;
    scheduledReportRunRepo = sut.scheduledReportRunRepo;
    requestReportUseCase = sut.requestReportUseCase;
    userManagementRepo = sut.userManagementRepo;
    auditService = sut.auditService;
    worker = sut.worker;
  });

  it('returns zero counts when no due schedules exist', async () => {
    const result = await worker.execute();
    expect(result).toEqual({ processedCount: 0, failedCount: 0, skippedCount: 0, autoPausedCount: 0 });
    expect(requestReportUseCase.execute).not.toHaveBeenCalled();
  });

  it('processes a due schedule by rehydrating the creator auth and calling RequestReportUseCase', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

    const result = await worker.execute();

    expect(userManagementRepo.findById).toHaveBeenCalledWith('user-1');
    expect(scheduledReportRunRepo.save).toHaveBeenCalledTimes(1);
    expect(requestReportUseCase.execute).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(requestReportUseCase.execute).mock.calls[0];
    const input = callArgs[0];
    const auth = callArgs[1];
    // Feature 019 critical: scheduledReportId is tagged on the request
    expect(input.scheduledReportId).toBe('sched-1');
    // Feature 019 critical: real auth rehydrated from the creator (not synthetic AM)
    expect(auth.role).toBe('OP');
    expect(auth.userId).toBe('user-1');
    expect(auth.tenantId).toBe('tenant-1');

    expect(result.processedCount).toBe(1);
  });

  it('auto-pauses the schedule when the owner is deactivated', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
    vi.mocked(userManagementRepo.findById).mockResolvedValue(makeUser({ status: 'DISABLED' } as any));

    const result = await worker.execute();

    expect(schedule.status).toBe('PAUSED');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduledReportAutoPaused',
        reason: 'owner_deactivated',
      }),
    );
    expect(requestReportUseCase.execute).not.toHaveBeenCalled();
    expect(result.autoPausedCount).toBe(1);
  });

  it('auto-pauses the schedule when the report type has been removed', async () => {
    const schedule = makeSchedule({ reportType: 'NONEXISTENT_TYPE' as any });
    vi.mocked(scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

    const result = await worker.execute();

    expect(schedule.status).toBe('PAUSED');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'report_type_removed' }),
    );
    expect(result.autoPausedCount).toBe(1);
  });

  it('defers the run on concurrent-limit errors without incrementing the failure counter', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
    vi.mocked(requestReportUseCase.execute).mockRejectedValue(new ReportConcurrentLimitExceededError());

    const result = await worker.execute();

    expect(schedule.consecutiveFailureCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.skippedCount).toBeGreaterThanOrEqual(1);
  });

  it('increments the failure counter and auto-pauses at 3 consecutive failures', async () => {
    const schedule = makeSchedule({ consecutiveFailureCount: 2 });
    vi.mocked(scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
    vi.mocked(requestReportUseCase.execute).mockRejectedValue(new ReportDateRangeExceededError(12));

    const result = await worker.execute();

    expect(schedule.consecutiveFailureCount).toBe(3);
    expect(schedule.status).toBe('PAUSED');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduledReportAutoPaused',
        reason: 'consecutive_failures',
      }),
    );
    expect(result.autoPausedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it('is idempotent on `(schedule_id, scheduled_for)` — does not double-run when a run row already exists', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

    // Pretend a run already exists for the target scheduledFor with non-queued status
    vi.mocked(scheduledReportRunRepo.findByScheduleAndScheduledFor).mockResolvedValue({
      id: 'run-existing',
      scheduleId: 'sched-1',
      status: 'completed',
    } as any);

    const result = await worker.execute();

    // The worker must not call requestReportUseCase for the duplicate tick
    expect(requestReportUseCase.execute).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });
});
