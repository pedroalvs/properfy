import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for registerWorkers — liveness log (T008)
 *
 * Asserts that after boss.work('notification.send', ...) returns successfully,
 * the logger emits a 'worker.notification_send.registered' info event exactly once.
 * Per spec §3.B1 Step 3 and AC-1.3.
 *
 * Note: mock paths are relative to THIS test file at src/main/__tests__/workers.test.ts.
 * ../../ goes from __tests__/ up through main/ to src/.
 */

const mockBoss = {
  work: vi.fn().mockResolvedValue(undefined),
  schedule: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../shared/infrastructure/queue', () => ({
  getQueue: vi.fn().mockResolvedValue(mockBoss),
  resolvePgBossSchema: vi.fn().mockReturnValue('pgboss'),
  assertQueueDbConsistency: vi.fn(),
}));

vi.mock('../../shared/infrastructure/prisma', () => ({
  prisma: {
    property: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
}

function makeWorkerMock() {
  return { execute: vi.fn().mockResolvedValue({}) };
}

async function callRegisterWorkers(logger: ReturnType<typeof makeLogger>) {
  const { registerWorkers } = await import('../workers');
  await registerWorkers(
    makeWorkerMock() as any,   // processReportJobUseCase
    makeWorkerMock() as any,   // sendNotificationUseCase
    makeWorkerMock() as any,   // pollRetryableNotificationsUseCase
    { execute: vi.fn().mockResolvedValue({ delivered: 0, failed: 0, unchanged: 0, errors: 0 }) } as any, // pollSmsDeliveryUseCase
    makeWorkerMock() as any,   // dispatchRemindersUseCase
    makeWorkerMock() as any,   // dispatchEscalationsUseCase
    makeWorkerMock() as any,   // cleanupSessionsWorker
    { execute: vi.fn().mockReturnValue({ daysRemaining: 90, level: 'OK' }) } as any,
    makeWorkerMock() as any,   // expireFilesWorker
    makeWorkerMock() as any,   // geocodeWorker
    makeWorkerMock() as any,   // geocodeRetryWorker
    makeWorkerMock() as any,   // appointmentImportCommitWorker
    makeWorkerMock() as any,   // sweepAbandonedAppointmentImportsWorker
    makeWorkerMock() as any,   // generateInvoiceFileWorker
    makeWorkerMock() as any,   // expireTokensWorker
    makeWorkerMock() as any,   // notifyStuckInspectionsWorker
    makeWorkerMock() as any,   // auditRetentionWorker
    makeWorkerMock() as any,   // rejectUnconfirmedWorker
    { deliver: vi.fn().mockResolvedValue(undefined) } as any, // fyWebhookDispatcher
    logger as any,
  );
}

describe('registerWorkers — cron schedules anchored to Australia/Sydney', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBoss.work.mockResolvedValue(undefined);
    mockBoss.schedule.mockResolvedValue(undefined);
    mockBoss.send.mockResolvedValue(undefined);
  });

  const EXPECTED_SCHEDULES: Array<[name: string, cron: string]> = [
    ['notification.retry-poll', '*/5 * * * *'],
    ['notification.sms-delivery-poll', '*/10 * * * *'],
    ['notification.dispatch-reminders', '0 18 * * *'],
    ['notification.dispatch-escalations', '0 18 * * *'],
    ['auth.cleanup-sessions', '0 2 * * *'],
    ['auth.check-key-expiry', '0 3 * * *'],
    ['report.expire-files', '0 3 * * *'],
    ['property.geocode-retry', '*/15 * * * *'],
    ['appointment.import.sweep-abandoned', '0 * * * *'],
    ['rental-tenant-portal.expire-tokens', '*/15 * * * *'],
    ['inspection-execution.notify-not-started', '0 * * * *'],
    ['audit.retention', '30 3 * * *'],
    ['appointment.reject-unconfirmed', '0 19 * * *'],
    ['system.dlq-monitor', '*/5 * * * *'],
  ];

  it('schedules every cron with the expected expression and tz Australia/Sydney', async () => {
    await callRegisterWorkers(makeLogger());

    expect(mockBoss.schedule).toHaveBeenCalledTimes(EXPECTED_SCHEDULES.length);
    for (const [name, cron] of EXPECTED_SCHEDULES) {
      expect(mockBoss.schedule).toHaveBeenCalledWith(name, cron, {}, { tz: 'Australia/Sydney' });
    }
  });
});

describe('registerWorkers — notification.send liveness log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBoss.work.mockResolvedValue(undefined);
    mockBoss.schedule.mockResolvedValue(undefined);
    mockBoss.send.mockResolvedValue(undefined);
  });

  it('should emit worker.notification_send.registered exactly once after boss.work resolves', async () => {
    const logger = makeLogger();

    await callRegisterWorkers(logger);

    const registeredCalls = logger.info.mock.calls.filter(([ctx, msg]: [any, string]) =>
      msg === 'worker.notification_send.registered' || ctx === 'worker.notification_send.registered',
    );

    expect(registeredCalls).toHaveLength(1);
  });

  it('should emit worker.notification_send.registered AFTER boss.work is called for notification.send', async () => {
    const logger = makeLogger();

    await callRegisterWorkers(logger);

    const notificationWorkCallIndex = mockBoss.work.mock.calls.findIndex(
      ([queueName]: [string]) => queueName === 'notification.send',
    );
    expect(notificationWorkCallIndex).toBeGreaterThanOrEqual(0);

    const registeredLogIndex = logger.info.mock.calls.findIndex(([ctx, msg]: [any, string]) =>
      msg === 'worker.notification_send.registered' || ctx === 'worker.notification_send.registered',
    );
    expect(registeredLogIndex).toBeGreaterThanOrEqual(0);

    const workCallOrder = mockBoss.work.mock.invocationCallOrder[notificationWorkCallIndex];
    const logCallOrder = logger.info.mock.invocationCallOrder[registeredLogIndex];
    expect(logCallOrder).toBeGreaterThan(workCallOrder!);
  });
});
