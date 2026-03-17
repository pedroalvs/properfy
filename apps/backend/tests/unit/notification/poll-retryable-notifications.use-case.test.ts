import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollRetryableNotificationsUseCase } from '../../../src/modules/notification/application/use-cases/poll-retryable-notifications.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';

function makeNotification(id: string): NotificationEntity {
  return new NotificationEntity({
    id,
    tenantId: 'tenant-1',
    appointmentId: null,
    recipient: 'user@example.com',
    channel: 'EMAIL',
    templateCode: 'reminder',
    status: 'PENDING',
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: {},
    retryCount: 1,
    nextRetryAt: new Date('2026-03-17T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('PollRetryableNotificationsUseCase', () => {
  let useCase: PollRetryableNotificationsUseCase;
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByProviderMessageId: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findRetryable: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockJobQueue: { enqueue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      findById: vi.fn(),
      findByProviderMessageId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      findRetryable: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      update: vi.fn(),
      existsByAppointmentAndTemplate: vi.fn(),
    };
    mockJobQueue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new PollRetryableNotificationsUseCase(
      mockRepo as unknown as INotificationRepository,
      mockJobQueue as unknown as IJobQueue,
    );
  });

  it('returns enqueuedCount: 0 when no retryable notifications', async () => {
    const result = await useCase.execute();

    expect(result.enqueuedCount).toBe(0);
    expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('calls findRetryable with current time', async () => {
    const before = new Date();
    await useCase.execute();
    const after = new Date();

    expect(mockRepo.findRetryable).toHaveBeenCalledOnce();
    const passedDate = mockRepo.findRetryable.mock.calls[0][0] as Date;
    expect(passedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(passedDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('enqueues notification.send for each retryable notification', async () => {
    mockRepo.findRetryable.mockResolvedValueOnce([
      makeNotification('notif-1'),
      makeNotification('notif-2'),
    ]);

    await useCase.execute();

    expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(2);
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: 'notif-1' },
      { retryLimit: 0 },
    );
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: 'notif-2' },
      { retryLimit: 0 },
    );
  });

  it('returns correct enqueuedCount matching list length', async () => {
    mockRepo.findRetryable.mockResolvedValueOnce([
      makeNotification('notif-1'),
      makeNotification('notif-2'),
      makeNotification('notif-3'),
    ]);

    const result = await useCase.execute();

    expect(result.enqueuedCount).toBe(3);
  });

  it('enqueues with retryLimit: 0', async () => {
    mockRepo.findRetryable.mockResolvedValueOnce([makeNotification('notif-1')]);

    await useCase.execute();

    const options = mockJobQueue.enqueue.mock.calls[0][2];
    expect(options).toEqual({ retryLimit: 0 });
  });

  it('handles single retryable notification correctly', async () => {
    mockRepo.findRetryable.mockResolvedValueOnce([makeNotification('notif-solo')]);

    const result = await useCase.execute();

    expect(result.enqueuedCount).toBe(1);
    expect(mockJobQueue.enqueue).toHaveBeenCalledOnce();
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: 'notif-solo' },
      { retryLimit: 0 },
    );
  });
});
