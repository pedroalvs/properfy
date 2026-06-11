import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollRetryableNotificationsUseCase } from '../../../src/modules/notification/application/use-cases/poll-retryable-notifications.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import type { Logger } from '../../../src/shared/infrastructure/logger';
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
    notificationClass: null,
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

function makeNotifications(count: number): NotificationEntity[] {
  return Array.from({ length: count }, (_, i) => makeNotification(`notif-${i + 1}`));
}

/** A PENDING row whose enqueue was lost: retryCount 0, nextRetryAt null. */
function makeStuckNotification(id: string, createdAt: Date): NotificationEntity {
  return new NotificationEntity({
    id,
    tenantId: 'tenant-1',
    appointmentId: null,
    recipient: 'user@example.com',
    channel: 'EMAIL',
    templateCode: 'TENANT_PORTAL_LINK',
    status: 'PENDING',
    notificationClass: null,
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: {},
    retryCount: 0,
    nextRetryAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

describe('PollRetryableNotificationsUseCase', () => {
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByProviderMessageId: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findRetryable: ReturnType<typeof vi.fn>;
    findStuckPending: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    existsByAppointmentAndTemplate: ReturnType<typeof vi.fn>;
  };
  let mockJobQueue: { enqueue: ReturnType<typeof vi.fn> };
  let mockLogger: { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      findById: vi.fn(),
      findByProviderMessageId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      findRetryable: vi.fn().mockResolvedValue([]),
      findStuckPending: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      update: vi.fn(),
      existsByAppointmentAndTemplate: vi.fn(),
    };
    mockJobQueue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
    };
  });

  function createUseCase(batchLimit?: number) {
    return new PollRetryableNotificationsUseCase(
      mockRepo as unknown as INotificationRepository,
      mockJobQueue as unknown as IJobQueue,
      mockLogger as unknown as Logger,
      batchLimit,
    );
  }

  it('returns enqueuedCount: 0 when no retryable notifications', async () => {
    const useCase = createUseCase();
    const result = await useCase.execute();

    expect(result.enqueuedCount).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('calls findRetryable with current time and limit + 1', async () => {
    const useCase = createUseCase(10);
    const before = new Date();
    await useCase.execute();
    const after = new Date();

    expect(mockRepo.findRetryable).toHaveBeenCalledOnce();
    const [passedDate, passedLimit] = mockRepo.findRetryable.mock.calls[0];
    expect((passedDate as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect((passedDate as Date).getTime()).toBeLessThanOrEqual(after.getTime());
    expect(passedLimit).toBe(11); // limit + 1 to detect overflow
  });

  it('enqueues notification.send for each retryable notification', async () => {
    const useCase = createUseCase();
    mockRepo.findRetryable.mockResolvedValueOnce([
      makeNotification('notif-1'),
      makeNotification('notif-2'),
    ]);

    await useCase.execute();

    expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(2);
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: 'notif-1' },
      expect.objectContaining({ retryLimit: 0, singletonKey: 'notif-1' }),
    );
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: 'notif-2' },
      expect.objectContaining({ retryLimit: 0, singletonKey: 'notif-2' }),
    );
  });

  it('returns correct enqueuedCount matching list length', async () => {
    const useCase = createUseCase();
    mockRepo.findRetryable.mockResolvedValueOnce([
      makeNotification('notif-1'),
      makeNotification('notif-2'),
      makeNotification('notif-3'),
    ]);

    const result = await useCase.execute();

    expect(result.enqueuedCount).toBe(3);
  });

  it('enqueues with retryLimit: 0 and singletonKey', async () => {
    const useCase = createUseCase();
    mockRepo.findRetryable.mockResolvedValueOnce([makeNotification('notif-1')]);

    await useCase.execute();

    const options = mockJobQueue.enqueue.mock.calls[0][2];
    expect(options).toMatchObject({ retryLimit: 0, singletonKey: 'notif-1', expireInMinutes: 5 });
  });

  it('handles single retryable notification correctly', async () => {
    const useCase = createUseCase();
    mockRepo.findRetryable.mockResolvedValueOnce([makeNotification('notif-solo')]);

    const result = await useCase.execute();

    expect(result.enqueuedCount).toBe(1);
    expect(mockJobQueue.enqueue).toHaveBeenCalledOnce();
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: 'notif-solo' },
      expect.objectContaining({ retryLimit: 0, singletonKey: 'notif-solo' }),
    );
  });

  describe('batch cap', () => {
    it('caps batch at configured limit', async () => {
      const batchLimit = 3;
      const useCase = createUseCase(batchLimit);
      // Return limit + 1 to indicate more exist
      mockRepo.findRetryable.mockResolvedValueOnce(makeNotifications(batchLimit + 1));

      const result = await useCase.execute();

      expect(result.enqueuedCount).toBe(batchLimit);
      expect(result.hasMore).toBe(true);
      expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(batchLimit);
    });

    it('logs warning when batch overflows', async () => {
      const batchLimit = 3;
      const useCase = createUseCase(batchLimit);
      mockRepo.findRetryable.mockResolvedValueOnce(makeNotifications(batchLimit + 1));

      await useCase.execute();

      expect(mockLogger.warn).toHaveBeenCalledOnce();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { batchLimit },
        expect.stringContaining('exceeded batch limit'),
      );
    });

    it('does not log warning when batch fits within limit', async () => {
      const batchLimit = 5;
      const useCase = createUseCase(batchLimit);
      mockRepo.findRetryable.mockResolvedValueOnce(makeNotifications(3));

      const result = await useCase.execute();

      expect(result.enqueuedCount).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('uses default batch limit of 500 when not configured', async () => {
      const useCase = createUseCase();
      await useCase.execute();

      expect(mockRepo.findRetryable).toHaveBeenCalledWith(expect.any(Date), 501);
    });

    it('processes exactly the limit when results equal limit + 1', async () => {
      const batchLimit = 2;
      const useCase = createUseCase(batchLimit);
      const notifications = makeNotifications(3); // limit + 1
      mockRepo.findRetryable.mockResolvedValueOnce(notifications);

      const result = await useCase.execute();

      expect(result.enqueuedCount).toBe(2);
      expect(result.hasMore).toBe(true);
      // Should only enqueue the first 2, not the 3rd
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        'notification.send',
        { notificationId: 'notif-1' },
        expect.objectContaining({ retryLimit: 0, singletonKey: 'notif-1' }),
      );
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        'notification.send',
        { notificationId: 'notif-2' },
        expect.objectContaining({ retryLimit: 0, singletonKey: 'notif-2' }),
      );
    });
  });

  describe('stuck never-enqueued self-heal', () => {
    it('queries stuck PENDING rows older than the 10-minute grace period', async () => {
      const useCase = createUseCase(10);
      const before = Date.now();
      await useCase.execute();
      const after = Date.now();

      expect(mockRepo.findStuckPending).toHaveBeenCalledOnce();
      const [cutoff, limit] = mockRepo.findStuckPending.mock.calls[0];
      const tenMinutes = 10 * 60 * 1000;
      expect((cutoff as Date).getTime()).toBeGreaterThanOrEqual(before - tenMinutes);
      expect((cutoff as Date).getTime()).toBeLessThanOrEqual(after - tenMinutes);
      expect(limit).toBe(11); // limit + 1 to detect overflow
    });

    it('re-enqueues stuck rows newer than 72 hours with the standard send options', async () => {
      const useCase = createUseCase();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      mockRepo.findStuckPending.mockResolvedValueOnce([
        makeStuckNotification('stuck-1', oneHourAgo),
      ]);

      const result = await useCase.execute();

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        'notification.send',
        { notificationId: 'stuck-1' },
        expect.objectContaining({ retryLimit: 0, singletonKey: 'stuck-1', expireInMinutes: 5 }),
      );
      expect(result.stuckReenqueuedCount).toBe(1);
      expect(result.stuckFailedCount).toBe(0);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('marks stuck rows older than 72 hours as FAILED instead of re-sending stale content', async () => {
      const useCase = createUseCase();
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const stale = makeStuckNotification('stuck-old', fourDaysAgo);
      mockRepo.findStuckPending.mockResolvedValueOnce([stale]);

      const result = await useCase.execute();

      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledOnce();
      const updated = mockRepo.update.mock.calls[0][0] as NotificationEntity;
      expect(updated.id).toBe('stuck-old');
      expect(updated.status).toBe('FAILED');
      expect(updated.failureReason).toBe('STUCK_NEVER_ENQUEUED');
      expect(updated.failedAt).toBeInstanceOf(Date);
      expect(result.stuckReenqueuedCount).toBe(0);
      expect(result.stuckFailedCount).toBe(1);
    });

    it('handles fresh and stale stuck rows in the same poll', async () => {
      const useCase = createUseCase();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      mockRepo.findStuckPending.mockResolvedValueOnce([
        makeStuckNotification('stuck-fresh', oneHourAgo),
        makeStuckNotification('stuck-old', fourDaysAgo),
      ]);

      const result = await useCase.execute();

      expect(result.stuckReenqueuedCount).toBe(1);
      expect(result.stuckFailedCount).toBe(1);
      expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(mockRepo.update).toHaveBeenCalledTimes(1);
    });

    it('counts retryable and stuck rows independently', async () => {
      const useCase = createUseCase();
      mockRepo.findRetryable.mockResolvedValueOnce([makeNotification('retry-1')]);
      mockRepo.findStuckPending.mockResolvedValueOnce([
        makeStuckNotification('stuck-1', new Date(Date.now() - 60 * 60 * 1000)),
      ]);

      const result = await useCase.execute();

      expect(result.enqueuedCount).toBe(1);
      expect(result.stuckReenqueuedCount).toBe(1);
      expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(2);
    });
  });

});
