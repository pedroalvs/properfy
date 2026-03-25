import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';
import { ValidationError } from '../../../src/shared/domain/errors';

describe('CreateNotificationUseCase', () => {
  let useCase: CreateNotificationUseCase;
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

  const baseInput = {
    tenantId: 'tenant-1',
    recipient: 'user@example.com',
    channel: 'EMAIL' as const,
    templateCode: 'appointment.reminder',
    payloadJson: { name: 'John', date: '2026-03-20' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      findById: vi.fn(),
      findByProviderMessageId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      findRetryable: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      existsByAppointmentAndTemplate: vi.fn(),
    };
    mockJobQueue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new CreateNotificationUseCase(
      mockRepo as unknown as INotificationRepository,
      mockJobQueue as unknown as IJobQueue,
    );
  });

  it('creates notification with PENDING status and saves it', async () => {
    await useCase.execute(baseInput);

    expect(mockRepo.save).toHaveBeenCalledOnce();
    const saved = mockRepo.save.mock.calls[0][0] as NotificationEntity;
    expect(saved.status).toBe('PENDING');
  });

  it('generates UUID for notification ID', async () => {
    const result = await useCase.execute(baseInput);

    expect(result.notificationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('enqueues notification.send job with notificationId', async () => {
    const result = await useCase.execute(baseInput);

    expect(mockJobQueue.enqueue).toHaveBeenCalledOnce();
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId: result.notificationId },
      { retryLimit: 0 },
    );
  });

  it('passes retryLimit: 0 to job queue', async () => {
    await useCase.execute(baseInput);

    const options = mockJobQueue.enqueue.mock.calls[0][2];
    expect(options).toEqual({ retryLimit: 0 });
  });

  it('sets appointmentId to null when not provided', async () => {
    await useCase.execute(baseInput);

    const saved = mockRepo.save.mock.calls[0][0] as NotificationEntity;
    expect(saved.appointmentId).toBeNull();
  });

  it('sets appointmentId when provided', async () => {
    await useCase.execute({ ...baseInput, appointmentId: 'appt-123' });

    const saved = mockRepo.save.mock.calls[0][0] as NotificationEntity;
    expect(saved.appointmentId).toBe('appt-123');
  });

  it('sets all initial fields correctly', async () => {
    await useCase.execute(baseInput);

    const saved = mockRepo.save.mock.calls[0][0] as NotificationEntity;
    expect(saved.tenantId).toBe('tenant-1');
    expect(saved.recipient).toBe('user@example.com');
    expect(saved.channel).toBe('EMAIL');
    expect(saved.templateCode).toBe('appointment.reminder');
    expect(saved.payloadJson).toEqual({ name: 'John', date: '2026-03-20' });
    expect(saved.retryCount).toBe(0);
    expect(saved.nextRetryAt).toBeNull();
    expect(saved.providerName).toBeNull();
    expect(saved.providerMessageId).toBeNull();
    expect(saved.sentAt).toBeNull();
    expect(saved.deliveredAt).toBeNull();
    expect(saved.failedAt).toBeNull();
    expect(saved.failureReason).toBeNull();
  });

  it('propagates repository save errors', async () => {
    mockRepo.save.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(useCase.execute(baseInput)).rejects.toThrow('DB write failed');
    expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects empty tenantId', async () => {
    await expect(
      useCase.execute({
        ...baseInput,
        tenantId: '',
      }),
    ).rejects.toThrow(ValidationError);

    expect(mockRepo.save).not.toHaveBeenCalled();
    expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
  });
});
