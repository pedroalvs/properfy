/**
 * Feature 019 T054: Integration test for the delivery fan-out path.
 *
 * These tests exercise DeliverScheduledReportUseCase end-to-end without a real
 * database, using in-memory mock implementations of every port. The focus is on
 * the fan-out orchestration logic: recipient resolution → notification dispatch →
 * run state update → audit entry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeliverScheduledReportUseCase,
  type NotificationSender,
} from '../../../src/modules/report/application/use-cases/deliver-scheduled-report.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../../src/modules/report/domain/scheduled-report-run.repository';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IScheduleRecipientResolver, ResolvedRecipient } from '../../../src/modules/report/domain/schedule-recipient-resolver';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { ScheduledReportRunEntity } from '../../../src/modules/report/domain/scheduled-report-run.entity';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import {
  ScheduleRunNotFoundError,
  ScheduledReportNotFoundError,
  ReportNotFoundError,
} from '../../../src/modules/report/domain/report.errors';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-integration-1',
    tenantId: 'tenant-integration',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    deliveryEmail: '',
    displayName: 'Integration Daily',
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
    isActive: true,
    lastRunAt: null,
    nextRunAt: now,
    createdByUserId: 'owner-integration',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeReport(overrides: Partial<ConstructorParameters<typeof ReportEntity>[0]> = {}) {
  const now = new Date();
  return new ReportEntity({
    id: 'report-integration-1',
    tenantId: 'tenant-integration',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    status: 'READY',
    fileKey: 'reports/tenant-integration/report-integration-1.xlsx',
    requestedByUserId: 'owner-integration',
    scheduledReportId: 'sched-integration-1',
    startedAt: now,
    completedAt: now,
    failedAt: null,
    errorMessage: null,
    rowCount: 5,
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeRun(overrides: Partial<ConstructorParameters<typeof ScheduledReportRunEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportRunEntity({
    id: 'run-integration-1',
    scheduleId: 'sched-integration-1',
    reportId: 'report-integration-1',
    status: 'running',
    scheduledFor: now,
    startedAt: now,
    completedAt: null,
    errorMessage: null,
    recipientCount: null,
    deliveryStatusJson: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function buildSut(options: {
  schedule?: ScheduledReportEntity | null;
  report?: ReportEntity | null;
  run?: ScheduledReportRunEntity | null;
  recipients?: ResolvedRecipient[];
} = {}) {
  const schedule = options.schedule !== undefined ? options.schedule : makeSchedule();
  const report = options.report !== undefined ? options.report : makeReport();
  const run = options.run !== undefined ? options.run : makeRun();
  const recipients: ResolvedRecipient[] = options.recipients ?? [
    { userId: 'owner-integration', email: 'owner@example.com', name: 'Owner', accessValid: true },
  ];

  const scheduleRepo: IScheduledReportRepository = {
    findById: vi.fn().mockResolvedValue(schedule),
    findByIdIncludingDeleted: vi.fn().mockResolvedValue(schedule),
    findDueForProcessing: vi.fn(),
    findDueSchedules: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countActiveByOwner: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const runRepo: IScheduledReportRunRepository = {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn().mockResolvedValue(run),
    findByReportId: vi.fn(),
    findByScheduleAndScheduledFor: vi.fn(),
    findByScheduleId: vi.fn(),
    countByScheduleId: vi.fn(),
    findLatestForSchedule: vi.fn(),
    findLatestForSchedules: vi.fn(),
  };

  const reportRepo: IReportRepository = {
    findById: vi.fn().mockResolvedValue(report),
    findAll: vi.fn(),
    count: vi.fn(),
    countByUserAndStatuses: vi.fn(),
    countByTenantAndStatuses: vi.fn(),
    findExpiredWithFileKey: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const recipientResolver: IScheduleRecipientResolver = {
    resolve: vi.fn().mockResolvedValue(recipients),
  };

  const notificationSender: NotificationSender = {
    execute: vi.fn().mockResolvedValue({ notificationId: 'notif-integration-1' }),
  };

  const auditService: AuditService = { log: vi.fn() };
  const logger = makeLogger();

  const useCase = new DeliverScheduledReportUseCase(
    scheduleRepo,
    runRepo,
    reportRepo,
    recipientResolver,
    notificationSender,
    auditService,
    logger,
  );

  return {
    scheduleRepo,
    runRepo,
    reportRepo,
    recipientResolver,
    notificationSender,
    auditService,
    logger,
    useCase,
    run,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DeliverScheduledReportUseCase — integration (T054)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path — report delivered to all recipients', () => {
    it('dispatches one notification per valid recipient', async () => {
      const recipients: ResolvedRecipient[] = [
        { userId: 'u1', email: 'u1@example.com', name: 'User 1', accessValid: true },
        { userId: 'u2', email: 'u2@example.com', name: 'User 2', accessValid: true },
        { userId: 'u3', email: 'u3@example.com', name: 'User 3', accessValid: true },
      ];
      const { useCase, notificationSender, run } = buildSut({ recipients });

      await useCase.execute({ runId: 'run-integration-1' });

      expect(notificationSender.execute).toHaveBeenCalledTimes(3);
      expect(run.status).toBe('completed');
      expect(run.recipientCount).toBe(3);
    });

    it('sends notifications with correct REPORT_READY payload structure', async () => {
      const { useCase, notificationSender } = buildSut();

      await useCase.execute({ runId: 'run-integration-1' });

      expect(notificationSender.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'EMAIL',
          templateCode: 'REPORT_READY',
          tenantId: 'tenant-integration',
          recipient: 'owner@example.com',
          payloadJson: expect.objectContaining({
            reportId: 'report-integration-1',
            downloadLink: '/reports/report-integration-1',
            userName: 'Owner',
          }),
        }),
      );
    });

    it('persists the run after delivery and records per-recipient outcomes', async () => {
      const recipients: ResolvedRecipient[] = [
        { userId: 'u1', email: 'u1@example.com', name: 'U1', accessValid: true },
        { userId: 'u2', email: null, name: 'U2', accessValid: false, skipReason: 'user_not_found' },
      ];
      const { useCase, runRepo, run } = buildSut({ recipients });

      await useCase.execute({ runId: 'run-integration-1' });

      expect(runRepo.update).toHaveBeenCalledWith(run);
      expect(run.deliveryStatusJson).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', status: 'delivered' }),
          expect.objectContaining({ userId: 'u2', status: 'skipped' }),
        ]),
      );
    });

    it('writes exactly one audit log entry for the completed run', async () => {
      const { useCase, auditService } = buildSut();

      await useCase.execute({ runId: 'run-integration-1' });

      const completedCalls = vi
        .mocked(auditService.log)
        .mock.calls.filter((c) => c[0].action === 'scheduledReportRunCompleted');
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0][0]).toMatchObject({
        tenantId: 'tenant-integration',
        actorType: 'SYSTEM',
        entityType: 'ScheduledReportRun',
      });
    });
  });

  describe('missing recipients — gracefully skips', () => {
    it('marks the run as failed when all recipients are invalid', async () => {
      const recipients: ResolvedRecipient[] = [
        { userId: 'u1', email: null, name: 'U1', accessValid: false, skipReason: 'user_not_found' },
        { userId: 'u2', email: null, name: 'U2', accessValid: false, skipReason: 'user_deactivated' },
      ];
      const { useCase, notificationSender, run } = buildSut({ recipients });

      await useCase.execute({ runId: 'run-integration-1' });

      expect(notificationSender.execute).not.toHaveBeenCalled();
      expect(run.status).toBe('failed');
      expect(run.errorMessage).toContain('no recipients');
    });

    it('still marks run as completed when at least one recipient succeeds despite others failing', async () => {
      const recipients: ResolvedRecipient[] = [
        { userId: 'u1', email: 'u1@example.com', name: 'U1', accessValid: true },
        { userId: 'u2', email: 'u2@example.com', name: 'U2', accessValid: true },
      ];
      const { useCase, notificationSender, run } = buildSut({ recipients });
      vi.mocked(notificationSender.execute)
        .mockResolvedValueOnce({ notificationId: 'n1' })
        .mockRejectedValueOnce(new Error('provider timeout'));

      await useCase.execute({ runId: 'run-integration-1' });

      expect(run.status).toBe('completed');
      expect(run.recipientCount).toBe(1);
    });

    it('logs failed notification dispatches via the logger without throwing', async () => {
      const recipients: ResolvedRecipient[] = [
        { userId: 'u1', email: 'u1@example.com', name: 'U1', accessValid: true },
      ];
      const { useCase, notificationSender, logger } = buildSut({ recipients });
      vi.mocked(notificationSender.execute).mockRejectedValue(new Error('provider error'));

      await useCase.execute({ runId: 'run-integration-1' });

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('schedule not found — throws error', () => {
    it('throws ScheduleRunNotFoundError when the run does not exist', async () => {
      const { useCase, runRepo } = buildSut();
      vi.mocked(runRepo.findById).mockResolvedValue(null);

      await expect(useCase.execute({ runId: 'ghost-run-id' })).rejects.toBeInstanceOf(
        ScheduleRunNotFoundError,
      );
    });

    it('throws ReportNotFoundError when the run has no reportId', async () => {
      const run = makeRun({ reportId: null });
      const { useCase } = buildSut({ run });

      await expect(useCase.execute({ runId: 'run-integration-1' })).rejects.toBeInstanceOf(
        ReportNotFoundError,
      );
    });

    it('throws ReportNotFoundError when the report row does not exist', async () => {
      const { useCase, reportRepo } = buildSut();
      vi.mocked(reportRepo.findById).mockResolvedValue(null);

      await expect(useCase.execute({ runId: 'run-integration-1' })).rejects.toBeInstanceOf(
        ReportNotFoundError,
      );
    });

    it('throws ScheduledReportNotFoundError when the schedule has been hard-deleted', async () => {
      const { useCase, scheduleRepo } = buildSut();
      vi.mocked(scheduleRepo.findByIdIncludingDeleted).mockResolvedValue(null);

      await expect(useCase.execute({ runId: 'run-integration-1' })).rejects.toBeInstanceOf(
        ScheduledReportNotFoundError,
      );
    });
  });

  describe('skip-delivery-when-empty toggle', () => {
    it('skips delivery and marks run skipped_empty when toggle is on and report is empty', async () => {
      const schedule = makeSchedule({ skipDeliveryWhenEmpty: true });
      const report = makeReport({ rowCount: 0 });
      const { useCase, notificationSender, run } = buildSut({ schedule, report });

      await useCase.execute({ runId: 'run-integration-1' });

      expect(notificationSender.execute).not.toHaveBeenCalled();
      expect(run.status).toBe('skipped_empty');
    });

    it('delivers normally when toggle is on but report has rows', async () => {
      const schedule = makeSchedule({ skipDeliveryWhenEmpty: true });
      const report = makeReport({ rowCount: 3 });
      const { useCase, notificationSender } = buildSut({ schedule, report });

      await useCase.execute({ runId: 'run-integration-1' });

      expect(notificationSender.execute).toHaveBeenCalled();
    });
  });
});
