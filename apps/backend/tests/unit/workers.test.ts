import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWork, mockSchedule } = vi.hoisted(() => ({
  mockWork: vi.fn(),
  mockSchedule: vi.fn(),
}));

vi.mock('../../src/shared/infrastructure/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({ work: mockWork, schedule: mockSchedule }),
}));

import { registerWorkers } from '../../src/main/workers';

describe('registerWorkers', () => {
  const mockReportExecute = vi.fn();
  const mockNotificationExecute = vi.fn();
  const mockPollRetryExecute = vi.fn().mockResolvedValue({ enqueuedCount: 0 });
  const mockDispatchRemindersExecute = vi.fn().mockResolvedValue({ dispatched: 0, skipped: 0 });
  const mockDispatchEscalationsExecute = vi.fn().mockResolvedValue({ pmEscalations: 0, smsAlerts: 0, skipped: 0 });
  const mockProcessReportJobUseCase = { execute: mockReportExecute } as any;
  const mockSendNotificationUseCase = { execute: mockNotificationExecute } as any;
  const mockPollRetryableNotificationsUseCase = { execute: mockPollRetryExecute } as any;
  const mockDispatchRemindersUseCase = { execute: mockDispatchRemindersExecute } as any;
  const mockDispatchEscalationsUseCase = { execute: mockDispatchEscalationsExecute } as any;
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all workers and schedules', async () => {
    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    expect(mockWork).toHaveBeenCalledTimes(5);
    expect(mockWork).toHaveBeenCalledWith('report.generate', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.send', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.retry-poll', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.dispatch-reminders', expect.any(Function));
    expect(mockWork).toHaveBeenCalledWith('notification.dispatch-escalations', expect.any(Function));
    expect(mockSchedule).toHaveBeenCalledTimes(3);
    expect(mockSchedule).toHaveBeenCalledWith('notification.retry-poll', '*/5 * * * *', {});
    expect(mockSchedule).toHaveBeenCalledWith('notification.dispatch-reminders', '0 8 * * *', {});
    expect(mockSchedule).toHaveBeenCalledWith('notification.dispatch-escalations', '0 8 * * *', {});
    expect(mockLogger.info).toHaveBeenCalledWith(
      'pg-boss workers registered: report.generate, notification.send, notification.retry-poll, notification.dispatch-reminders, notification.dispatch-escalations',
    );
  });

  it('report.generate handler calls processReportJobUseCase.execute with correct reportId', async () => {
    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[0][1];
    const fakeJob = { id: 'job-456', data: { reportId: 'report-123' } };
    await handler(fakeJob);

    expect(mockReportExecute).toHaveBeenCalledOnce();
    expect(mockReportExecute).toHaveBeenCalledWith('report-123');
    expect(mockLogger.info).toHaveBeenCalledWith(
      { reportId: 'report-123', jobId: 'job-456' },
      'Processing report.generate job',
    );
  });

  it('notification.send handler calls sendNotificationUseCase.execute with correct notificationId', async () => {
    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[1][1];
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

    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[2][1];
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

  it('notification.dispatch-reminders handler calls dispatchRemindersUseCase.execute and logs result', async () => {
    mockDispatchRemindersExecute.mockResolvedValueOnce({ dispatched: 3, skipped: 2 });

    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[3][1];
    const fakeJob = { id: 'job-reminders' };
    await handler(fakeJob);

    expect(mockDispatchRemindersExecute).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-reminders' },
      'Processing notification.dispatch-reminders job',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-reminders', dispatched: 3, skipped: 2 },
      'Dispatch reminders completed',
    );
  });

  it('notification.dispatch-escalations handler calls dispatchEscalationsUseCase.execute and logs result', async () => {
    mockDispatchEscalationsExecute.mockResolvedValueOnce({ pmEscalations: 2, smsAlerts: 1, skipped: 3 });

    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[4][1];
    const fakeJob = { id: 'job-escalations' };
    await handler(fakeJob);

    expect(mockDispatchEscalationsExecute).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-escalations' },
      'Processing notification.dispatch-escalations job',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      { jobId: 'job-escalations', pmEscalations: 2, smsAlerts: 1, skipped: 3 },
      'Dispatch escalations completed',
    );
  });

  it('propagates errors from report use case for pg-boss retry handling', async () => {
    const error = new Error('Report generation failed');
    mockReportExecute.mockRejectedValueOnce(error);

    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[0][1];
    const fakeJob = { id: 'job-err', data: { reportId: 'report-fail' } };

    await expect(handler(fakeJob)).rejects.toThrow('Report generation failed');
  });

  it('propagates errors from notification use case for pg-boss retry handling', async () => {
    const error = new Error('Notification send failed');
    mockNotificationExecute.mockRejectedValueOnce(error);

    await registerWorkers(
      mockProcessReportJobUseCase,
      mockSendNotificationUseCase,
      mockPollRetryableNotificationsUseCase,
      mockDispatchRemindersUseCase,
      mockDispatchEscalationsUseCase,
      mockLogger,
    );

    const handler = mockWork.mock.calls[1][1];
    const fakeJob = { id: 'job-err', data: { notificationId: 'notif-fail' } };

    await expect(handler(fakeJob)).rejects.toThrow('Notification send failed');
  });
});
