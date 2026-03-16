import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendNotificationUseCase } from '../../../src/modules/notification/application/use-cases/send-notification.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type {
  IEmailProvider,
  ISmsProvider,
  IWhatsAppProvider,
} from '../../../src/modules/notification/domain/providers';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import {
  NotificationEntity,
  type NotificationProps,
} from '../../../src/modules/notification/domain/notification.entity';
import {
  NotificationTemplateEntity,
  type NotificationTemplateProps,
} from '../../../src/modules/notification/domain/notification-template.entity';
import { NotificationNotFoundError } from '../../../src/modules/notification/domain/notification.errors';
import { NotificationInvalidStatusError } from '../../../src/modules/notification/domain/notification.errors';
import { TemplateNotFoundError } from '../../../src/modules/notification/domain/notification.errors';
import { MAX_RETRY_COUNT } from '../../../src/modules/notification/domain/notification.constants';

const now = new Date('2026-03-16T10:00:00.000Z');

function makeNotification(overrides: Partial<NotificationProps> = {}): NotificationEntity {
  const defaults: NotificationProps = {
    id: 'notif-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    recipient: 'user@example.com',
    channel: 'EMAIL',
    templateCode: 'INSPECTION_NOTICE',
    status: 'PENDING',
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: { tenantName: 'John', date: '2026-03-20' },
    retryCount: 0,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return new NotificationEntity({ ...defaults, ...overrides });
}

function makeTemplate(overrides: Partial<NotificationTemplateProps> = {}): NotificationTemplateEntity {
  const defaults: NotificationTemplateProps = {
    id: 'tmpl-1',
    tenantId: 'tenant-1',
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection for {{tenantName}}',
    bodyHtml: '<p>Hello {{tenantName}}, your inspection is on {{date}}</p>',
    bodyText: 'Hello {{tenantName}}, your inspection is on {{date}}',
    variablesJson: ['tenantName', 'date'],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  return new NotificationTemplateEntity({ ...defaults, ...overrides });
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
  const templateRepo: INotificationTemplateRepository = {
    findByTenantCodeChannel: vi.fn(),
    findAll: vi.fn(),
    upsert: vi.fn(),
  };
  const emailProvider: IEmailProvider = {
    send: vi.fn(),
  };
  const smsProvider: ISmsProvider = {
    send: vi.fn(),
  };
  const whatsAppProvider: IWhatsAppProvider = {
    send: vi.fn(),
  };
  const templateRenderer = new TemplateRendererService();

  const useCase = new SendNotificationUseCase(
    notificationRepo,
    templateRepo,
    emailProvider,
    smsProvider,
    whatsAppProvider,
    templateRenderer,
  );

  return { notificationRepo, templateRepo, emailProvider, smsProvider, whatsAppProvider, templateRenderer, useCase };
}

describe('SendNotificationUseCase', () => {
  let notificationRepo: INotificationRepository;
  let templateRepo: INotificationTemplateRepository;
  let emailProvider: IEmailProvider;
  let smsProvider: ISmsProvider;
  let whatsAppProvider: IWhatsAppProvider;
  let useCase: SendNotificationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    templateRepo = sut.templateRepo;
    emailProvider = sut.emailProvider;
    smsProvider = sut.smsProvider;
    whatsAppProvider = sut.whatsAppProvider;
    useCase = sut.useCase;
  });

  it('should throw NotificationNotFoundError when notification does not exist', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ notificationId: 'notif-1' })).rejects.toThrow(
      NotificationNotFoundError,
    );
  });

  it('should throw NotificationInvalidStatusError when notification is not PENDING', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(makeNotification({ status: 'SENT' }));

    await expect(useCase.execute({ notificationId: 'notif-1' })).rejects.toThrow(
      NotificationInvalidStatusError,
    );
  });

  it('should throw TemplateNotFoundError when no template found (tenant or default)', async () => {
    vi.mocked(notificationRepo.findById).mockResolvedValue(makeNotification());
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);

    await expect(useCase.execute({ notificationId: 'notif-1' })).rejects.toThrow(
      TemplateNotFoundError,
    );

    // Should have tried tenant-specific then platform default
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledTimes(2);
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenNthCalledWith(
      1,
      'tenant-1',
      'INSPECTION_NOTICE',
      'EMAIL',
    );
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenNthCalledWith(
      2,
      null,
      'INSPECTION_NOTICE',
      'EMAIL',
    );
  });

  it('should fall back to platform default template when tenant template not found', async () => {
    const notification = makeNotification();
    const defaultTemplate = makeTemplate({ tenantId: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel)
      .mockResolvedValueOnce(null) // tenant-specific not found
      .mockResolvedValueOnce(defaultTemplate); // platform default found
    vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(emailProvider.send).toHaveBeenCalled();
    expect(notificationRepo.update).toHaveBeenCalled();
  });

  it('should render template and send email via email provider', async () => {
    const notification = makeNotification();
    const template = makeTemplate();

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
    vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-email-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      'Inspection for John',
      '<p>Hello John, your inspection is on 2026-03-20</p>',
      'Hello John, your inspection is on 2026-03-20',
    );
  });

  it('should render template and send SMS via SMS provider', async () => {
    const notification = makeNotification({ channel: 'SMS', recipient: '+5511999999999' });
    const template = makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
    vi.mocked(smsProvider.send).mockResolvedValue({ messageId: 'msg-sms-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(smsProvider.send).toHaveBeenCalledWith(
      '+5511999999999',
      'Hello John, your inspection is on 2026-03-20',
    );
  });

  it('should render template and send WhatsApp via WhatsApp provider', async () => {
    const notification = makeNotification({ channel: 'WHATSAPP', recipient: '+5511888888888' });
    const template = makeTemplate({ channel: 'WHATSAPP', subject: null, bodyHtml: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
    vi.mocked(whatsAppProvider.send).mockResolvedValue({ messageId: 'msg-wa-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(whatsAppProvider.send).toHaveBeenCalledWith(
      '+5511888888888',
      'Hello John, your inspection is on 2026-03-20',
    );
  });

  it('should update notification to SENT on provider success with providerName and providerMessageId', async () => {
    const notification = makeNotification();

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
    vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-42' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(notificationRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SENT',
        providerName: 'resend',
        providerMessageId: 'msg-42',
      }),
    );
    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.sentAt).toBeInstanceOf(Date);
  });

  it('should increment retryCount on provider failure when under max retries', async () => {
    const notification = makeNotification({ retryCount: 0 });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
    vi.mocked(emailProvider.send).mockRejectedValue(new Error('Provider timeout'));

    await useCase.execute({ notificationId: 'notif-1' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.retryCount).toBe(1);
    expect(updated.status).toBe('PENDING');
  });

  it('should compute nextRetryAt with backoff on failure', async () => {
    const notification = makeNotification({ retryCount: 2 });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
    vi.mocked(emailProvider.send).mockRejectedValue(new Error('Provider error'));

    await useCase.execute({ notificationId: 'notif-1' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.nextRetryAt).toBeInstanceOf(Date);
    // retryCount is now 3, so delayIndex = 2 => RETRY_DELAYS[2] = 120_000 (2 min)
    // Allow +-10% jitter: 108_000 to 132_000 ms from now
    const delayMs = updated.nextRetryAt!.getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(100_000);
    expect(delayMs).toBeLessThan(140_000);
  });

  it('should mark as FAILED when retryCount reaches max (6)', async () => {
    const notification = makeNotification({ retryCount: 5 });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
    vi.mocked(emailProvider.send).mockRejectedValue(new Error('Final failure'));

    await useCase.execute({ notificationId: 'notif-1' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.retryCount).toBe(MAX_RETRY_COUNT);
    expect(updated.status).toBe('FAILED');
    expect(updated.failedAt).toBeInstanceOf(Date);
  });

  it('should set failureReason on final failure', async () => {
    const notification = makeNotification({ retryCount: 5 });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
    vi.mocked(emailProvider.send).mockRejectedValue(new Error('Connection refused'));

    await useCase.execute({ notificationId: 'notif-1' });

    const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
    expect(updated.failureReason).toBe('Connection refused');
  });
});
