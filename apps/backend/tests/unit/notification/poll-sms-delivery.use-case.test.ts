import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollSmsDeliveryUseCase } from '../../../src/modules/notification/application/use-cases/poll-sms-delivery.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { ISmsProvider } from '../../../src/modules/notification/domain/providers';
import type { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function makeSentSms(overrides: Partial<NotificationEntity> = {}): NotificationEntity {
  return {
    id: 'notif-1',
    tenantId: 'tenant-1',
    channel: 'SMS',
    status: 'SENT',
    recipient: '+61412345678',
    providerMessageId: 'mm-1',
    sentAt: new Date('2026-07-05T10:00:00Z'),
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    updatedAt: new Date('2026-07-05T10:00:00Z'),
    ...overrides,
  } as NotificationEntity;
}

describe('PollSmsDeliveryUseCase', () => {
  let notificationRepo: INotificationRepository;
  let smsProvider: ISmsProvider;
  let useCase: PollSmsDeliveryUseCase;
  const now = new Date('2026-07-05T12:00:00Z');

  const logger = {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  } as unknown as Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationRepo = {
      findSmsAwaitingDeliveryReceipt: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    } as unknown as INotificationRepository;
    smsProvider = { send: vi.fn(), getStatus: vi.fn().mockResolvedValue(null) };
    useCase = new PollSmsDeliveryUseCase(notificationRepo, smsProvider, logger);
  });

  it('queries the 10min–72h window of SENT SMS rows', async () => {
    await useCase.execute(now);
    expect(notificationRepo.findSmsAwaitingDeliveryReceipt).toHaveBeenCalledWith(
      new Date(now.getTime() - 72 * 60 * 60 * 1000),
      new Date(now.getTime() - 10 * 60 * 1000),
      100,
    );
  });

  it('marks DELIVERED when the provider reports delivered', async () => {
    const row = makeSentSms();
    vi.mocked(notificationRepo.findSmsAwaitingDeliveryReceipt).mockResolvedValue([row]);
    vi.mocked(smsProvider.getStatus).mockResolvedValue('delivered');

    const result = await useCase.execute(now);

    expect(smsProvider.getStatus).toHaveBeenCalledWith('mm-1');
    expect(notificationRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notif-1', status: 'DELIVERED' }),
    );
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect(result.delivered).toBe(1);
  });

  it.each(['failed', 'cancelled'] as const)('marks FAILED when the provider reports %s', async (status) => {
    const row = makeSentSms();
    vi.mocked(notificationRepo.findSmsAwaitingDeliveryReceipt).mockResolvedValue([row]);
    vi.mocked(smsProvider.getStatus).mockResolvedValue(status);

    const result = await useCase.execute(now);

    expect(notificationRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-1',
        status: 'FAILED',
        failureReason: `Provider mobile-message reported: ${status}`,
      }),
    );
    expect(result.failed).toBe(1);
  });

  it.each(['pending', 'scheduled', 'sent', null] as const)('leaves the row untouched on %s', async (status) => {
    const row = makeSentSms();
    vi.mocked(notificationRepo.findSmsAwaitingDeliveryReceipt).mockResolvedValue([row]);
    vi.mocked(smsProvider.getStatus).mockResolvedValue(status);

    const result = await useCase.execute(now);

    expect(notificationRepo.update).not.toHaveBeenCalled();
    expect(result.unchanged).toBe(1);
  });

  it('continues the batch when one provider lookup throws', async () => {
    const rows = [makeSentSms(), makeSentSms({ id: 'notif-2', providerMessageId: 'mm-2' })];
    vi.mocked(notificationRepo.findSmsAwaitingDeliveryReceipt).mockResolvedValue(rows);
    vi.mocked(smsProvider.getStatus)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('delivered');

    const result = await useCase.execute(now);

    expect(result.errors).toBe(1);
    expect(result.delivered).toBe(1);
    expect(notificationRepo.update).toHaveBeenCalledTimes(1);
  });

  it('skips rows without a providerMessageId', async () => {
    vi.mocked(notificationRepo.findSmsAwaitingDeliveryReceipt).mockResolvedValue([
      makeSentSms({ providerMessageId: null }),
    ]);

    const result = await useCase.execute(now);

    expect(smsProvider.getStatus).not.toHaveBeenCalled();
    expect(result.unchanged).toBe(1);
  });
});
