import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandleProviderWebhookUseCase } from '../../../src/modules/notification/application/use-cases/handle-provider-webhook.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import {
  NotificationEntity,
  type NotificationProps,
} from '../../../src/modules/notification/domain/notification.entity';

const now = new Date('2026-03-16T10:00:00.000Z');

function makeNotification(overrides: Partial<NotificationProps> = {}): NotificationEntity {
  const defaults: NotificationProps = {
    id: 'notif-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    recipient: 'user@example.com',
    channel: 'EMAIL',
    templateCode: 'INSPECTION_NOTICE',
    status: 'SENT',
    providerName: 'resend',
    providerMessageId: 'provider-msg-1',
    sentAt: now,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: { tenantName: 'John' },
    retryCount: 0,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return new NotificationEntity({ ...defaults, ...overrides });
}

function makeSut() {
  const notificationRepo: INotificationRepository = {
    findById: vi.fn(),
    findByProviderMessageId: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const useCase = new HandleProviderWebhookUseCase(notificationRepo);
  return { notificationRepo, useCase };
}

const baseInput = {
  provider: 'resend',
  providerMessageId: 'provider-msg-1',
  event: 'delivered',
  occurredAt: '2026-03-16T10:05:00.000Z',
  rawPayload: {},
};

describe('HandleProviderWebhookUseCase', () => {
  let notificationRepo: INotificationRepository;
  let useCase: HandleProviderWebhookUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    useCase = sut.useCase;
  });

  it('should gracefully ignore unknown providerMessageId', async () => {
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(null);

    await expect(useCase.execute(baseInput)).resolves.toBeUndefined();
    expect(notificationRepo.update).not.toHaveBeenCalled();
  });

  it('should update to DELIVERED on delivered event', async () => {
    const notification = makeNotification({ status: 'SENT' });
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(notification);

    await useCase.execute({ ...baseInput, event: 'delivered' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.status).toBe('DELIVERED');
    expect(updated.deliveredAt).toEqual(new Date('2026-03-16T10:05:00.000Z'));
  });

  it('should update to FAILED on failed event', async () => {
    const notification = makeNotification({ status: 'SENT' });
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(notification);

    await useCase.execute({ ...baseInput, event: 'failed' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.status).toBe('FAILED');
    expect(updated.failedAt).toEqual(new Date('2026-03-16T10:05:00.000Z'));
    expect(updated.failureReason).toBe('Provider resend reported: failed');
  });

  it('should update to FAILED on bounced event', async () => {
    const notification = makeNotification({ status: 'SENT' });
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(notification);

    await useCase.execute({ ...baseInput, event: 'bounced' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.status).toBe('FAILED');
    expect(updated.failureReason).toBe('Provider resend reported: bounced');
  });

  it('should not downgrade from DELIVERED to SENT', async () => {
    const notification = makeNotification({ status: 'DELIVERED', deliveredAt: now });
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(notification);

    // 'delivered' event on already-DELIVERED notification should be a no-op
    await useCase.execute({ ...baseInput, event: 'delivered' });

    expect(notificationRepo.update).not.toHaveBeenCalled();
  });

  it('should not downgrade from DELIVERED to FAILED', async () => {
    const notification = makeNotification({ status: 'DELIVERED', deliveredAt: now });
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(notification);

    await useCase.execute({ ...baseInput, event: 'failed' });

    expect(notificationRepo.update).not.toHaveBeenCalled();
  });

  it('should ignore clicked and opened events (no status change)', async () => {
    const notification = makeNotification({ status: 'DELIVERED' });
    vi.mocked(notificationRepo.findByProviderMessageId).mockResolvedValue(notification);

    await useCase.execute({ ...baseInput, event: 'clicked' });
    expect(notificationRepo.update).not.toHaveBeenCalled();

    await useCase.execute({ ...baseInput, event: 'opened' });
    expect(notificationRepo.update).not.toHaveBeenCalled();
  });
});
