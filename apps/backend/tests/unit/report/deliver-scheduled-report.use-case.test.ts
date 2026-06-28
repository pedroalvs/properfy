import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliverScheduledReportUseCase, type NotificationSender } from '../../../src/modules/report/application/use-cases/deliver-scheduled-report.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { IScheduledReportRunRepository } from '../../../src/modules/report/domain/scheduled-report-run.repository';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IScheduleRecipientResolver, ResolvedRecipient } from '../../../src/modules/report/domain/schedule-recipient-resolver';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import { ScheduledReportRunEntity } from '../../../src/modules/report/domain/scheduled-report-run.entity';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';

function makeSchedule(overrides: Partial<ConstructorParameters<typeof ScheduledReportEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    displayName: 'Daily',
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
    lastRunAt: null,
    nextRunAt: now,
    createdByUserId: 'owner-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeReport(overrides: Partial<ConstructorParameters<typeof ReportEntity>[0]> = {}) {
  const now = new Date();
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    status: 'READY',
    fileKey: 'reports/tenant-1/report-1.xlsx',
    requestedByUserId: 'owner-1',
    scheduledReportId: 'sched-1',
    startedAt: now,
    completedAt: now,
    failedAt: null,
    errorMessage: null,
    rowCount: 42,
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeRun(overrides: Partial<ConstructorParameters<typeof ScheduledReportRunEntity>[0]> = {}) {
  const now = new Date();
  return new ScheduledReportRunEntity({
    id: 'run-1',
    scheduleId: 'sched-1',
    reportId: 'report-1',
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

function makeSut() {
  const scheduleRepo: IScheduledReportRepository = {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
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
    findById: vi.fn(),
    findByReportId: vi.fn(),
    findByScheduleAndScheduledFor: vi.fn(),
    findByScheduleId: vi.fn(),
    countByScheduleId: vi.fn(),
    findLatestForSchedule: vi.fn(),
    findLatestForSchedules: vi.fn(),
  };
  const reportRepo: IReportRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countByUserAndStatuses: vi.fn(),
    countByTenantAndStatuses: vi.fn(),
    findExpiredWithFileKey: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const resolver: IScheduleRecipientResolver = {
    resolve: vi.fn().mockResolvedValue([]),
  };
  const notificationSender: NotificationSender = {
    execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
  };
  const auditService: AuditService = { log: vi.fn() };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;

  const useCase = new DeliverScheduledReportUseCase(
    scheduleRepo,
    runRepo,
    reportRepo,
    resolver,
    notificationSender,
    auditService,
    logger,
  );

  return { scheduleRepo, runRepo, reportRepo, resolver, notificationSender, auditService, useCase };
}

describe('DeliverScheduledReportUseCase (feature 019 US3)', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  function wireFixture(schedule: ScheduledReportEntity, report: ReportEntity, run: ScheduledReportRunEntity) {
    vi.mocked(sut.runRepo.findById).mockResolvedValue(run);
    vi.mocked(sut.reportRepo.findById).mockResolvedValue(report);
    vi.mocked(sut.scheduleRepo.findByIdIncludingDeleted).mockResolvedValue(schedule);
  }

  it('delivers to the owner in OWNER_ONLY mode', async () => {
    const schedule = makeSchedule();
    const report = makeReport();
    const run = makeRun();
    wireFixture(schedule, report, run);

    const recipient: ResolvedRecipient = {
      userId: 'owner-1',
      email: 'owner@example.com',
      name: 'Owner',
      accessValid: true,
    };
    vi.mocked(sut.resolver.resolve).mockResolvedValue([recipient]);

    await sut.useCase.execute({ runId: 'run-1' });

    expect(sut.notificationSender.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'REPORT_READY',
        recipient: 'owner@example.com',
        payloadJson: expect.objectContaining({
          reportId: 'report-1',
          downloadLink: '/reports/report-1',
        }),
      }),
    );
    expect(run.status).toBe('completed');
    expect(run.recipientCount).toBe(1);
  });

  it('skips delivery and marks run skipped_empty when rowCount=0 and toggle is on', async () => {
    const schedule = makeSchedule({ skipDeliveryWhenEmpty: true });
    const report = makeReport({ rowCount: 0 });
    const run = makeRun();
    wireFixture(schedule, report, run);

    await sut.useCase.execute({ runId: 'run-1' });

    expect(sut.notificationSender.execute).not.toHaveBeenCalled();
    expect(run.status).toBe('skipped_empty');
    expect(sut.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'scheduledReportRunSkippedEmpty' }),
    );
  });

  it('delivers zero-row reports when the toggle is off (default)', async () => {
    const schedule = makeSchedule({ skipDeliveryWhenEmpty: false });
    const report = makeReport({ rowCount: 0 });
    const run = makeRun();
    wireFixture(schedule, report, run);

    vi.mocked(sut.resolver.resolve).mockResolvedValue([
      { userId: 'owner-1', email: 'owner@example.com', name: 'Owner', accessValid: true },
    ]);

    await sut.useCase.execute({ runId: 'run-1' });

    expect(sut.notificationSender.execute).toHaveBeenCalledOnce();
    expect(run.status).toBe('completed');
  });

  it('skips invalid recipients and logs them in delivery_status_json', async () => {
    const schedule = makeSchedule({ deliveryMode: 'RECIPIENT_LIST', recipientUserIds: ['u1', 'u2', 'u3'] });
    const report = makeReport();
    const run = makeRun();
    wireFixture(schedule, report, run);

    vi.mocked(sut.resolver.resolve).mockResolvedValue([
      { userId: 'u1', email: 'u1@example.com', name: 'U1', accessValid: true },
      { userId: 'u2', email: null, name: 'U2', accessValid: false, skipReason: 'user_deactivated' },
      { userId: 'u3', email: 'u3@example.com', name: 'U3', accessValid: true },
    ]);

    await sut.useCase.execute({ runId: 'run-1' });

    expect(sut.notificationSender.execute).toHaveBeenCalledTimes(2);
    expect(run.status).toBe('completed');
    expect(run.recipientCount).toBe(2);
    expect(run.deliveryStatusJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', status: 'delivered' }),
        expect.objectContaining({ userId: 'u2', status: 'skipped', reason: 'user_deactivated' }),
        expect.objectContaining({ userId: 'u3', status: 'delivered' }),
      ]),
    );
  });

  it('marks the run as completed even if a single notification dispatch fails (partial success)', async () => {
    const schedule = makeSchedule({ deliveryMode: 'RECIPIENT_LIST', recipientUserIds: ['u1', 'u2'] });
    const report = makeReport();
    const run = makeRun();
    wireFixture(schedule, report, run);

    vi.mocked(sut.resolver.resolve).mockResolvedValue([
      { userId: 'u1', email: 'u1@example.com', name: 'U1', accessValid: true },
      { userId: 'u2', email: 'u2@example.com', name: 'U2', accessValid: true },
    ]);
    vi.mocked(sut.notificationSender.execute)
      .mockResolvedValueOnce({ notificationId: 'n1' })
      .mockRejectedValueOnce(new Error('provider error'));

    await sut.useCase.execute({ runId: 'run-1' });

    expect(run.status).toBe('completed');
    expect(run.recipientCount).toBe(1);
  });

  it('writes exactly one audit entry per run — not per recipient', async () => {
    const schedule = makeSchedule({ deliveryMode: 'RECIPIENT_LIST', recipientUserIds: ['u1', 'u2', 'u3'] });
    const report = makeReport();
    const run = makeRun();
    wireFixture(schedule, report, run);

    vi.mocked(sut.resolver.resolve).mockResolvedValue([
      { userId: 'u1', email: 'u1@example.com', name: 'U1', accessValid: true },
      { userId: 'u2', email: 'u2@example.com', name: 'U2', accessValid: true },
      { userId: 'u3', email: 'u3@example.com', name: 'U3', accessValid: true },
    ]);

    await sut.useCase.execute({ runId: 'run-1' });

    const runCompletedCalls = vi
      .mocked(sut.auditService.log)
      .mock.calls.filter((c) => c[0].action === 'scheduledReportRunCompleted');
    expect(runCompletedCalls).toHaveLength(1);
  });
});
