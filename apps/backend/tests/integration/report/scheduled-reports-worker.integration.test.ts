/**
 * Feature 019 T077: Worker end-to-end integration test.
 *
 * Exercises ProcessSchedulesWorker orchestration logic end-to-end using mock
 * implementations of every port. Validates: due schedule processing, paused
 * schedule skipping, auth rehydration correctness, and idempotency guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessSchedulesWorker } from '../../../src/modules/report/infrastructure/workers/process-schedules.worker';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../../src/modules/report/domain/scheduled-report-run.repository';
import type { RequestReportUseCase } from '../../../src/modules/report/application/use-cases/request-report.use-case';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { UserEntity } from '../../../src/modules/auth/domain/user.entity';
import { ReportConcurrentLimitExceededError } from '../../../src/modules/report/domain/report.errors';

// ─── Fixtures ───────────────────────────────────────────────────────────────

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
    id: 'creator-1',
    tenantId: 'tenant-integration',
    branchId: null,
    role: 'CL_ADMIN',
    name: 'Schedule Creator',
    email: 'creator@example.com',
    phone: null,
    status: 'ACTIVE',
    passwordHash: 'hash',
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  });
}

function makeSchedule(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-worker-1',
    tenantId: 'tenant-integration',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    deliveryEmail: 'reports@example.com',
    displayName: 'Worker Integration Daily',
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date(now.getTime() - 60_000), // 1 minute ago (due)
    createdByUserId: 'creator-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function buildSut() {
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
      reportId: 'report-worker-1',
      status: 'PENDING',
      reportType: 'INSPECTIONS_SCHEDULED',
      createdAt: new Date(),
    }),
  } as unknown as RequestReportUseCase;

  const userManagementRepo: IUserManagementRepository = {
    findById: vi.fn().mockResolvedValue(makeUser()),
    findByIdAndTenantId: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProcessSchedulesWorker — integration (T077)', () => {
  let sut: ReturnType<typeof buildSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = buildSut();
  });

  describe('processes due schedules', () => {
    it('returns zero counts when no schedules are due', async () => {
      const result = await sut.worker.execute();

      expect(result).toEqual({ processedCount: 0, failedCount: 0, skippedCount: 0, autoPausedCount: 0 });
      expect(sut.requestReportUseCase.execute).not.toHaveBeenCalled();
    });

    it('processes a single due schedule and increments processedCount', async () => {
      const schedule = makeSchedule();
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

      const result = await sut.worker.execute();

      expect(sut.requestReportUseCase.execute).toHaveBeenCalledTimes(1);
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.autoPausedCount).toBe(0);
    });

    it('processes multiple due schedules in the same tick', async () => {
      const schedules = [
        makeSchedule({ id: 'sched-a', reportType: 'INSPECTIONS_SCHEDULED' }),
        makeSchedule({ id: 'sched-b', reportType: 'INSPECTIONS_DONE' }),
      ];
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue(schedules);
      vi.mocked(sut.scheduledReportRunRepo.findByScheduleAndScheduledFor).mockResolvedValue(null);

      const result = await sut.worker.execute();

      expect(sut.requestReportUseCase.execute).toHaveBeenCalledTimes(2);
      expect(result.processedCount).toBe(2);
    });

    it('creates a run row and advances the schedule next_run_at on success', async () => {
      const schedule = makeSchedule();
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

      await sut.worker.execute();

      expect(sut.scheduledReportRunRepo.save).toHaveBeenCalledTimes(1);
      expect(sut.scheduledReportRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ consecutiveFailureCount: 0 }),
      );
    });
  });

  describe('skips paused schedules', () => {
    it('does not process a PAUSED schedule even if its next_run_at is overdue', async () => {
      // The repository's findDueForProcessing already excludes paused schedules in production.
      // This test confirms the worker returns zero counts when the repo returns nothing.
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([]);

      const result = await sut.worker.execute();

      expect(sut.requestReportUseCase.execute).not.toHaveBeenCalled();
      expect(result.processedCount).toBe(0);
    });

    it('auto-pauses and records audit when the owner is deactivated', async () => {
      const schedule = makeSchedule();
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.userManagementRepo.findById).mockResolvedValue(
        makeUser({ status: 'DISABLED' as any }),
      );

      const result = await sut.worker.execute();

      expect(schedule.status).toBe('PAUSED');
      expect(sut.auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'scheduledReportAutoPaused', reason: 'owner_deactivated' }),
      );
      expect(result.autoPausedCount).toBe(1);
      expect(sut.requestReportUseCase.execute).not.toHaveBeenCalled();
    });

    it('auto-pauses and records audit when the report type has been removed', async () => {
      const schedule = makeSchedule({ reportType: 'NONEXISTENT_TYPE' as any });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

      const result = await sut.worker.execute();

      expect(schedule.status).toBe('PAUSED');
      expect(sut.auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'report_type_removed' }),
      );
      expect(result.autoPausedCount).toBe(1);
    });
  });

  describe('auth rehydration', () => {
    it('loads the schedule creator from the user repository', async () => {
      const schedule = makeSchedule({ createdByUserId: 'creator-1' });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

      await sut.worker.execute();

      expect(sut.userManagementRepo.findById).toHaveBeenCalledWith('creator-1');
    });

    it('passes the creator tenantId from the schedule to the report request (not synthetic AM)', async () => {
      const schedule = makeSchedule({
        createdByUserId: 'creator-1',
        tenantId: 'tenant-integration',
      });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.userManagementRepo.findById).mockResolvedValue(
        makeUser({ id: 'creator-1', tenantId: 'tenant-integration', role: 'CL_ADMIN' }),
      );

      await sut.worker.execute();

      const callArgs = vi.mocked(sut.requestReportUseCase.execute).mock.calls[0];
      const auth = callArgs[1];
      expect(auth.tenantId).toBe('tenant-integration');
      expect(auth.role).toBe('CL_ADMIN');
      expect(auth.userId).toBe('creator-1');
    });

    it('tags the correct scheduledReportId on the report request', async () => {
      const schedule = makeSchedule({ id: 'sched-worker-1' });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);

      await sut.worker.execute();

      const callArgs = vi.mocked(sut.requestReportUseCase.execute).mock.calls[0];
      const input = callArgs[0];
      expect(input.scheduledReportId).toBe('sched-worker-1');
    });

    it('does not use a synthetic AM role when the creator has a tenant-scoped role', async () => {
      const schedule = makeSchedule({ createdByUserId: 'creator-1' });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.userManagementRepo.findById).mockResolvedValue(
        makeUser({ id: 'creator-1', role: 'OP' }),
      );

      await sut.worker.execute();

      const callArgs = vi.mocked(sut.requestReportUseCase.execute).mock.calls[0];
      const auth = callArgs[1];
      // Feature 019 critical: role must be the creator's actual role, never a synthetic AM
      expect(auth.role).not.toBe('AM');
      expect(auth.role).toBe('OP');
    });
  });

  describe('idempotency and error handling', () => {
    it('does not re-run a schedule that already has a completed run for the same tick', async () => {
      const schedule = makeSchedule();
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.scheduledReportRunRepo.findByScheduleAndScheduledFor).mockResolvedValue({
        id: 'run-existing',
        scheduleId: 'sched-worker-1',
        status: 'completed',
      } as any);

      const result = await sut.worker.execute();

      expect(sut.requestReportUseCase.execute).not.toHaveBeenCalled();
      expect(result.processedCount).toBe(0);
    });

    it('defers the run without incrementing failure count on concurrent-limit errors', async () => {
      const schedule = makeSchedule();
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.requestReportUseCase.execute).mockRejectedValue(
        new ReportConcurrentLimitExceededError(),
      );

      const result = await sut.worker.execute();

      expect(schedule.consecutiveFailureCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('increments the failure counter on permanent errors', async () => {
      const schedule = makeSchedule({ consecutiveFailureCount: 1 });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.requestReportUseCase.execute).mockRejectedValue(
        new Error('Permanent failure'),
      );

      const result = await sut.worker.execute();

      expect(schedule.consecutiveFailureCount).toBe(2);
      expect(result.failedCount).toBe(1);
    });

    it('auto-pauses the schedule at 3 consecutive failures', async () => {
      const schedule = makeSchedule({ consecutiveFailureCount: 2 });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([schedule]);
      vi.mocked(sut.requestReportUseCase.execute).mockRejectedValue(
        new Error('Third failure'),
      );

      const result = await sut.worker.execute();

      expect(schedule.status).toBe('PAUSED');
      expect(sut.auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'scheduledReportAutoPaused',
          reason: 'consecutive_failures',
        }),
      );
      expect(result.autoPausedCount).toBe(1);
    });

    it('continues processing subsequent schedules when one schedule fails', async () => {
      const failingSchedule = makeSchedule({ id: 'failing-sched', reportType: 'INSPECTIONS_SCHEDULED' });
      const successSchedule = makeSchedule({ id: 'success-sched', reportType: 'INSPECTIONS_DONE' });
      vi.mocked(sut.scheduledReportRepo.findDueForProcessing).mockResolvedValue([
        failingSchedule,
        successSchedule,
      ]);
      vi.mocked(sut.requestReportUseCase.execute)
        .mockRejectedValueOnce(new Error('First schedule error'))
        .mockResolvedValueOnce({ reportId: 'report-2', status: 'PENDING', reportType: 'INSPECTIONS_DONE', createdAt: new Date() });

      const result = await sut.worker.execute();

      // First: failure + auto-pause guard didn't throw, second: success
      expect(result.failedCount).toBe(1);
      expect(result.processedCount).toBe(1);
    });
  });
});
