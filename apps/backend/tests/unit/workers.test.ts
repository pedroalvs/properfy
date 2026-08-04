import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWork, mockSchedule } = vi.hoisted(() => ({
  mockWork: vi.fn(),
  mockSchedule: vi.fn(),
}));

vi.mock('../../src/shared/infrastructure/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({ work: mockWork, schedule: mockSchedule }),
  resolvePgBossSchema: vi.fn().mockReturnValue('pgboss'),
  assertQueueDbConsistency: vi.fn(),
}));

vi.mock('../../src/shared/infrastructure/prisma', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    // Per-tenant tick: claim insert returns 1 row (claim won).
    $executeRaw: vi.fn().mockResolvedValue(1),
    property: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue([{ id: 'tenant-1', timezone: 'Australia/Sydney' }]),
    },
  },
}));

vi.mock('../../src/shared/infrastructure/metrics', () => ({
  metrics: {
    jobExecuted: vi.fn(),
  },
}));

vi.mock('../../src/shared/infrastructure/request-context', () => ({
  runWithRequestContext: vi.fn((_ctx: any, fn: () => any) => fn()),
}));

import { registerWorkers } from '../../src/main/workers';

describe('registerWorkers', () => {
  const mockReportExecute = vi.fn();
  const mockNotificationExecute = vi.fn();
  const mockPollRetryExecute = vi.fn().mockResolvedValue({ enqueuedCount: 0 });
  const mockDispatchRemindersExecute = vi.fn().mockResolvedValue({ dispatched: 0, skipped: 0 });
  const mockDispatchEscalationsExecute = vi.fn().mockResolvedValue({ pmEscalations: 0, smsAlerts: 0, skipped: 0 });
  const mockCleanupSessionsExecute = vi.fn().mockResolvedValue({ deletedCount: 0 });
  const mockExpireFilesExecute = vi.fn().mockResolvedValue({ expiredCount: 0 });
  const mockGeocodeExecute = vi.fn().mockResolvedValue(undefined);
  const mockGeocodeRetryExecute = vi.fn().mockResolvedValue({ reenqueuedCount: 0, pendingReenqueuedCount: 0, failedGeocodingCount: 0 });
  const mockCommitExecute = vi.fn().mockResolvedValue(undefined);
  const mockSweepExecute = vi.fn().mockResolvedValue({ sweptCount: 0 });
  const mockGenerateInvoiceFileExecute = vi.fn().mockResolvedValue(undefined);
  const mockExpireTokensExecute = vi.fn().mockResolvedValue({ expiredCount: 0 });
  const mockNotifyStuckExecute = vi.fn().mockResolvedValue({ notifiedCount: 0 });
  const mockProcessReportJobUseCase = { execute: mockReportExecute } as any;
  const mockSendNotificationUseCase = { execute: mockNotificationExecute } as any;
  const mockPollRetryableNotificationsUseCase = { execute: mockPollRetryExecute } as any;
  const mockPollSmsDeliveryExecute = vi.fn().mockResolvedValue({ delivered: 0, failed: 0, unchanged: 0, errors: 0 });
  const mockPollSmsDeliveryUseCase = { execute: mockPollSmsDeliveryExecute } as any;
  const mockDispatchRemindersUseCase = { execute: mockDispatchRemindersExecute } as any;
  const mockDispatchEscalationsUseCase = { execute: mockDispatchEscalationsExecute } as any;
  const mockCleanupSessionsWorker = { execute: mockCleanupSessionsExecute } as any;
  const mockExpireFilesWorker = { execute: mockExpireFilesExecute } as any;
  const mockGeocodeWorker = { execute: mockGeocodeExecute } as any;
  const mockGeocodeRetryWorker = { execute: mockGeocodeRetryExecute } as any;
  const mockAppointmentImportCommitWorker = { execute: mockCommitExecute } as any;
  const mockSweepAbandonedAppointmentImportsWorker = { execute: mockSweepExecute } as any;
  const mockGenerateInvoiceFileWorker = { execute: mockGenerateInvoiceFileExecute } as any;
  const mockExpireTokensWorker = { execute: mockExpireTokensExecute } as any;
  const mockNotifyStuckWorker = { execute: mockNotifyStuckExecute } as any;
  const mockKeyExpiryCheckExecute = vi.fn().mockResolvedValue({ daysRemaining: null, level: 'none' });
  const mockKeyExpiryCheckWorker = { execute: mockKeyExpiryCheckExecute } as any;
  const mockAuditRetentionExecute = vi.fn().mockResolvedValue({ deletedCount: 0, preservedCount: 0 });
  const mockAuditRetentionWorker = { execute: mockAuditRetentionExecute } as any;
  const mockRejectUnconfirmedExecute = vi.fn().mockResolvedValue({ rejectedCount: 0, groupsClosedCount: 0, groupsUpdatedCount: 0 });
  const mockRejectUnconfirmedWorker = { execute: mockRejectUnconfirmedExecute } as any;
  const mockCancelOverdueWorker = {
    execute: vi.fn().mockResolvedValue({ cancelledCount: 0, failedCount: 0, batchCapped: false }),
  } as any;
  const mockCancelEmptyGroupsWorker = {
    execute: vi.fn().mockResolvedValue({ checkedCount: 0, cancelledCount: 0, failedCount: 0 }),
  } as any;
  const mockFyWebhookDispatcher = { deliver: vi.fn().mockResolvedValue(undefined) } as any;
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as any;

  function callRegister() {
    return registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockPollSmsDeliveryUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockCleanupSessionsWorker,
      mockKeyExpiryCheckWorker,
      mockExpireFilesWorker,
      mockGeocodeWorker,
      mockGeocodeRetryWorker,
      mockAppointmentImportCommitWorker,
      mockSweepAbandonedAppointmentImportsWorker,
      mockGenerateInvoiceFileWorker,
      mockExpireTokensWorker,
      mockNotifyStuckWorker,
      mockAuditRetentionWorker,
      mockRejectUnconfirmedWorker,
      mockCancelOverdueWorker,
      mockCancelEmptyGroupsWorker,
      mockFyWebhookDispatcher,
      mockLogger,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all workers and schedules', async () => {
    await callRegister();

    expect(mockWork).toHaveBeenCalledTimes(22);
    expect(mockWork).toHaveBeenCalledWith('fy.webhook.deliver', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('report.generate', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.send', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.retry-poll', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.sms-delivery-poll', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.dispatch-reminders', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.dispatch-escalations', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('auth.cleanup-sessions', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('auth.check-key-expiry', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('report.expire-files', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('property.geocode', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('property.geocode-retry', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('appointment.import.commit', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('appointment.import.sweep-abandoned', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('billing.generate-invoice-file', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('rental-tenant-portal.expire-tokens', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('inspection-execution.notify-not-started', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('audit.retention', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('appointment.reject-unconfirmed', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('appointment.cancel-overdue', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('service-group.cancel-empty', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('system.dlq-monitor', expect.any(Function));
    // All recurring jobs are anchored to the platform timezone (Sydney).
    const sydneyTz = { tz: 'Australia/Sydney' };
    expect(mockSchedule).toHaveBeenCalledTimes(16);
    expect(mockSchedule).toHaveBeenCalledWith('notification.retry-poll', '*/5 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('notification.sms-delivery-poll', '*/10 * * * *', {}, sydneyTz);
    // Per-agency civil-day jobs run as hourly ticks; the agency-local target
    // hour lives in the handler (TenantCronTick), not in the cron expression.
    expect(mockSchedule).toHaveBeenCalledWith('notification.dispatch-reminders', '0 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('notification.dispatch-escalations', '0 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('auth.cleanup-sessions', '0 2 * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('auth.check-key-expiry', '0 3 * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('report.expire-files', '0 3 * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('property.geocode-retry', '*/15 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('rental-tenant-portal.expire-tokens', '*/15 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('inspection-execution.notify-not-started', '0 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('audit.retention', '30 3 * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('appointment.reject-unconfirmed', '0 * * * *', {}, sydneyTz);
    // Hourly at minute 10: fires when each agency's local midnight has passed.
    expect(mockSchedule).toHaveBeenCalledWith('appointment.cancel-overdue', '10 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('service-group.cancel-empty', '20 0 * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('appointment.import.sweep-abandoned', '0 * * * *', {}, sydneyTz);
    expect(mockSchedule).toHaveBeenCalledWith('system.dlq-monitor', '*/5 * * * *', {}, sydneyTz);
  });

  it('report.generate handler calls processReportJobUseCase.execute with correct reportId', async () => {
    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'report.generate')![1];
    const fakeJob = { id: 'job-456', data: { reportId: 'report-123' } };
    await handler(fakeJob);

    expect(mockReportExecute).toHaveBeenCalledOnce();
    expect(mockReportExecute).toHaveBeenCalledWith('report-123');
    expect(mockLogger.info).toHaveBeenCalledWith(
      { reportId: 'report-123', jobId: 'job-456' },
      'Processing report.generate job',
    );
  });

  it('property.geocode-retry handler logs the sweep result including pendingReenqueuedCount', async () => {
    mockGeocodeRetryExecute.mockResolvedValueOnce({ reenqueuedCount: 2, pendingReenqueuedCount: 3, failedGeocodingCount: 1 });
    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'property.geocode-retry')![1];
    await handler({ id: 'job-geo', data: {} });

    expect(mockGeocodeRetryExecute).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-geo', reenqueuedCount: 2, pendingReenqueuedCount: 3, failedGeocodingCount: 1 },
      'Geocode retry sweep completed',
    );
  });

  it('notification.send handler calls sendNotificationUseCase.execute with correct notificationId', async () => {
    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'notification.send')![1];
    const fakeJob = { id: 'job-789', data: { notificationId: 'notif-123' } };
    await handler(fakeJob);

    expect(mockNotificationExecute).toHaveBeenCalledOnce();
    expect(mockNotificationExecute).toHaveBeenCalledWith({ notificationId: 'notif-123' });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { notificationId: 'notif-123', jobId: 'job-789' },
      'Processing notification.send job',
    );
  });

  it('notification.retry-poll handler calls pollRetryableNotificationsUseCase.execute', async () => {
    mockPollRetryExecute.mockResolvedValueOnce({ enqueuedCount: 5 });

    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'notification.retry-poll')![1];
    const fakeJob = { id: 'job-poll' };
    await handler(fakeJob);

    expect(mockPollRetryExecute).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-poll' },
      'Processing notification.retry-poll job',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-poll', enqueuedCount: 5 },
      'Retry poll completed',
    );
  });

  it('notification.dispatch-reminders handler fans out per claimed timezone group', async () => {
    // 10:00Z = 20:00 Sydney — past the 18:00 local target, so the mocked
    // Sydney tenant is claimed.
    vi.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
    mockDispatchRemindersExecute.mockResolvedValueOnce({ dispatched: 3, skipped: 2 });

    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'notification.dispatch-reminders')![1];
    const fakeJob = { id: 'job-reminders' };
    await handler(fakeJob);

    expect(mockDispatchRemindersExecute).toHaveBeenCalledOnce();
    expect(mockDispatchRemindersExecute).toHaveBeenCalledWith(expect.any(Date), {
      timezone: 'Australia/Sydney',
      tenantIds: ['tenant-1'],
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-reminders', groups: 1, dispatched: 3, skipped: 2 },
      'Dispatch reminders completed',
    );
    vi.useRealTimers();
  });

  it('notification.dispatch-reminders handler is a no-op before the local target hour', async () => {
    // 04:00Z = 14:00 Sydney — before 18:00, nothing is claimed.
    vi.useFakeTimers({ now: new Date('2026-06-15T04:00:00.000Z') });

    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'notification.dispatch-reminders')![1];
    await handler({ id: 'job-reminders' });

    expect(mockDispatchRemindersExecute).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('notification.dispatch-escalations handler fans out per claimed timezone group', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T10:00:00.000Z') });
    mockDispatchEscalationsExecute.mockResolvedValueOnce({ pmEscalations: 2, smsAlerts: 1, skipped: 3 });

    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'notification.dispatch-escalations')![1];
    const fakeJob = { id: 'job-escalations' };
    await handler(fakeJob);

    expect(mockDispatchEscalationsExecute).toHaveBeenCalledOnce();
    expect(mockDispatchEscalationsExecute).toHaveBeenCalledWith(expect.any(Date), {
      timezone: 'Australia/Sydney',
      tenantIds: ['tenant-1'],
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-escalations', groups: 1, pmEscalations: 2, smsAlerts: 1, skipped: 3 },
      'Dispatch escalations completed',
    );
    vi.useRealTimers();
  });

  it('propagates errors from report use case for pg-boss retry handling', async () => {
    const error = new Error('Report generation failed');
    mockReportExecute.mockRejectedValueOnce(error);

    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'report.generate')![1];
    const fakeJob = { id: 'job-err', data: { reportId: 'report-fail' } };

    await expect(handler(fakeJob)).rejects.toThrow('Report generation failed');
  });

  it('propagates errors from notification use case for pg-boss retry handling', async () => {
    const error = new Error('Notification send failed');
    mockNotificationExecute.mockRejectedValueOnce(error);

    await callRegister();

    const handler = mockWork.mock.calls.find((c: any) => c[0] === 'notification.send')![1];
    const fakeJob = { id: 'job-err', data: { notificationId: 'notif-fail' } };

    await expect(handler(fakeJob)).rejects.toThrow('Notification send failed');
  });
});
