import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendNotificationUseCase } from '../../../src/modules/notification/application/use-cases/send-notification.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import type { INotificationAttemptRepository } from '../../../src/modules/notification/domain/notification-attempt.repository';
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
import type { Logger } from '../../../src/shared/infrastructure/logger';
import type { MetricsCollector } from '../../../src/shared/infrastructure/metrics';

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
    whatsappApprovalStatus: 'APPROVED',
    whatsappApprovalReference: null,
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
    existsByAppointmentAndTemplate: vi.fn(),
    findRetryable: vi.fn(),
    countByTenantChannelSince: vi.fn().mockResolvedValue(0),
  };
  const templateRepo: INotificationTemplateRepository = {
    findByTenantCodeChannel: vi.fn(),
    findAll: vi.fn(),
    upsert: vi.fn(),
  };
  const consentRepo: INotificationConsentRepository = {
    findByRecipientChannelTenant: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
  };
  const attemptRepo: INotificationAttemptRepository = {
    save: vi.fn(),
    update: vi.fn(),
    findByNotificationId: vi.fn(),
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
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as Logger;
  const metricsObj = {
    incrementMissingVariableCount: vi.fn(),
  } as unknown as MetricsCollector;
  const getTenantSettings = vi.fn().mockResolvedValue({});

  const useCase = new SendNotificationUseCase({
    notificationRepo,
    templateRepo,
    consentRepo,
    attemptRepo,
    emailProvider,
    smsProvider,
    whatsAppProvider,
    templateRenderer,
    logger,
    metrics: metricsObj,
    getTenantSettings,
  });

  return {
    notificationRepo,
    templateRepo,
    consentRepo,
    attemptRepo,
    emailProvider,
    smsProvider,
    whatsAppProvider,
    templateRenderer,
    logger,
    metrics: metricsObj,
    getTenantSettings,
    useCase,
  };
}

describe('SendNotificationUseCase', () => {
  let notificationRepo: INotificationRepository;
  let templateRepo: INotificationTemplateRepository;
  let attemptRepo: INotificationAttemptRepository;
  let emailProvider: IEmailProvider;
  let smsProvider: ISmsProvider;
  let whatsAppProvider: IWhatsAppProvider;
  let useCase: SendNotificationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    templateRepo = sut.templateRepo;
    attemptRepo = sut.attemptRepo;
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

  // GAP-002: WhatsApp template approval tracking
  describe('GAP-002: WhatsApp template approval', () => {
    it('should send WhatsApp when template is APPROVED', async () => {
      const notification = makeNotification({ channel: 'WHATSAPP', recipient: '+5511888888888' });
      const template = makeTemplate({
        channel: 'WHATSAPP',
        subject: null,
        bodyHtml: null,
        whatsappApprovalStatus: 'APPROVED',
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
      vi.mocked(whatsAppProvider.send).mockResolvedValue({ messageId: 'msg-wa-ok' });

      await useCase.execute({ notificationId: 'notif-1' });

      expect(whatsAppProvider.send).toHaveBeenCalled();
      const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SENT');
    });

    it('should fail WhatsApp notification when template is PENDING approval', async () => {
      const notification = makeNotification({ channel: 'WHATSAPP', recipient: '+5511888888888' });
      const template = makeTemplate({
        channel: 'WHATSAPP',
        subject: null,
        bodyHtml: null,
        whatsappApprovalStatus: 'PENDING',
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);

      await useCase.execute({ notificationId: 'notif-1' });

      expect(whatsAppProvider.send).not.toHaveBeenCalled();
      const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('FAILED');
      expect(updated.failureReason).toBe('WHATSAPP_TEMPLATE_NOT_APPROVED');
      expect(updated.failedAt).toBeInstanceOf(Date);
    });

    it('should fail WhatsApp notification when template is REJECTED', async () => {
      const notification = makeNotification({ channel: 'WHATSAPP', recipient: '+5511888888888' });
      const template = makeTemplate({
        channel: 'WHATSAPP',
        subject: null,
        bodyHtml: null,
        whatsappApprovalStatus: 'REJECTED',
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);

      await useCase.execute({ notificationId: 'notif-1' });

      expect(whatsAppProvider.send).not.toHaveBeenCalled();
      const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('FAILED');
      expect(updated.failureReason).toBe('WHATSAPP_TEMPLATE_NOT_APPROVED');
    });

    it('should not check WhatsApp approval for EMAIL channel', async () => {
      const notification = makeNotification({ channel: 'EMAIL' });
      const template = makeTemplate({
        channel: 'EMAIL',
        whatsappApprovalStatus: 'PENDING', // Should be ignored for EMAIL
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
      vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await useCase.execute({ notificationId: 'notif-1' });

      expect(emailProvider.send).toHaveBeenCalled();
      const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SENT');
    });

    it('should not check WhatsApp approval for SMS channel', async () => {
      const notification = makeNotification({ channel: 'SMS', recipient: '+5511999999999' });
      const template = makeTemplate({
        channel: 'SMS',
        subject: null,
        bodyHtml: null,
        whatsappApprovalStatus: 'REJECTED', // Should be ignored for SMS
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
      vi.mocked(smsProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await useCase.execute({ notificationId: 'notif-1' });

      expect(smsProvider.send).toHaveBeenCalled();
      const updated = vi.mocked(notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SENT');
    });
  });

  // GAP-001: Consent opt-out
  describe('GAP-001: consent opt-out', () => {
    it('should skip notification when recipient has opted out', async () => {
      const notification = makeNotification();
      const { NotificationConsentEntity: ConsentClass } = await import(
        '../../../src/modules/notification/domain/notification-consent.entity'
      );
      const consent = new ConsentClass({
        id: 'consent-1',
        recipient: 'user@example.com',
        channel: 'EMAIL' as any,
        tenantId: 'tenant-1',
        optedOut: true,
        optedOutAt: now,
        createdAt: now,
        updatedAt: now,
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      const sut = makeSut();
      vi.mocked(sut.consentRepo.findByRecipientChannelTenant).mockResolvedValue(consent);
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(notification);

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SKIPPED');
      expect(updated.failureReason).toBe('CONSENT_OPT_OUT');
      expect(sut.emailProvider.send).not.toHaveBeenCalled();
    });

    it('should send notification when recipient has not opted out', async () => {
      const { NotificationConsentEntity: ConsentClass } = await import(
        '../../../src/modules/notification/domain/notification-consent.entity'
      );
      const consent = new ConsentClass({
        id: 'consent-1',
        recipient: 'user@example.com',
        channel: 'EMAIL' as any,
        tenantId: 'tenant-1',
        optedOut: false,
        optedOutAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.consentRepo.findByRecipientChannelTenant).mockResolvedValue(consent);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
    });

    it('should send notification when no consent record exists', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.consentRepo.findByRecipientChannelTenant).mockResolvedValue(null);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
    });
  });

  // GAP-003: Per-tenant budget / rate limit
  describe('GAP-003: daily budget cap', () => {
    it('should fail with BUDGET_EXCEEDED when email cap is reached', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification({ channel: 'EMAIL' }));
      vi.mocked(sut.getTenantSettings).mockResolvedValue({ notificationDailyCapEmail: 10 });
      vi.mocked(sut.notificationRepo.countByTenantChannelSince).mockResolvedValue(10);

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('FAILED');
      expect(updated.failureReason).toBe('BUDGET_EXCEEDED');
      expect(sut.emailProvider.send).not.toHaveBeenCalled();
    });

    it('should fail with BUDGET_EXCEEDED when SMS cap is reached', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ channel: 'SMS', recipient: '+61400000000' }),
      );
      vi.mocked(sut.getTenantSettings).mockResolvedValue({ notificationDailyCapSms: 5 });
      vi.mocked(sut.notificationRepo.countByTenantChannelSince).mockResolvedValue(5);

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('FAILED');
      expect(updated.failureReason).toBe('BUDGET_EXCEEDED');
      expect(sut.smsProvider.send).not.toHaveBeenCalled();
    });

    it('should send notification when within budget', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification({ channel: 'EMAIL' }));
      vi.mocked(sut.getTenantSettings).mockResolvedValue({ notificationDailyCapEmail: 10 });
      vi.mocked(sut.notificationRepo.countByTenantChannelSince).mockResolvedValue(9);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SENT');
    });

    it('should not apply cap to WhatsApp channel', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ channel: 'WHATSAPP', recipient: '+61400000000' }),
      );
      vi.mocked(sut.getTenantSettings).mockResolvedValue({});
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ channel: 'WHATSAPP', subject: null, bodyHtml: null }),
      );
      vi.mocked(sut.whatsAppProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.notificationRepo.countByTenantChannelSince).not.toHaveBeenCalled();
      expect(sut.whatsAppProvider.send).toHaveBeenCalled();
    });
  });

  // GAP-004: Variable validation
  describe('GAP-004: strict variables validation', () => {
    it('should log warning when template has missing variables', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ payloadJson: { tenantName: 'John' } }), // missing 'date'
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      // Should still send (warn but don't fail)
      expect(sut.emailProvider.send).toHaveBeenCalled();
      expect(sut.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-1',
          missingVariables: expect.arrayContaining(['date']),
        }),
        expect.stringContaining('notification.missing_variable'),
      );
      expect(sut.metrics.incrementMissingVariableCount).toHaveBeenCalled();
    });

    it('should not log warning when all variables are present', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.logger.warn).not.toHaveBeenCalled();
      expect(sut.metrics.incrementMissingVariableCount).not.toHaveBeenCalled();
    });
  });

  // GAP-009: Per-attempt audit trail
  describe('GAP-009: Per-attempt audit trail', () => {
    it('should create one attempt row on successful send', async () => {
      const notification = makeNotification();
      const template = makeTemplate();

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
      vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      // Capture status at save time (before mutation)
      let statusAtSave: string | undefined;
      vi.mocked(attemptRepo.save).mockImplementation(async (a) => { statusAtSave = a.status; });

      await useCase.execute({ notificationId: 'notif-1' });

      // Should save an attempt at start with PENDING status
      expect(attemptRepo.save).toHaveBeenCalledTimes(1);
      expect(statusAtSave).toBe('PENDING');
      const savedAttempt = vi.mocked(attemptRepo.save).mock.calls[0][0];
      expect(savedAttempt.notificationId).toBe('notif-1');
      expect(savedAttempt.attemptNumber).toBe(1);
      expect(savedAttempt.startedAt).toBeInstanceOf(Date);

      // Should update attempt with success (same reference, now mutated)
      expect(attemptRepo.update).toHaveBeenCalledTimes(1);
      const updatedAttempt = vi.mocked(attemptRepo.update).mock.calls[0][0];
      expect(updatedAttempt.status).toBe('SUCCESS');
      expect(updatedAttempt.finishedAt).toBeInstanceOf(Date);
      expect(updatedAttempt.providerError).toBeNull();
    });

    it('should create attempt row with FAILED status on provider failure', async () => {
      const notification = makeNotification({ retryCount: 0 });
      const template = makeTemplate();

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
      vi.mocked(emailProvider.send).mockRejectedValue(new Error('Provider timeout'));

      await useCase.execute({ notificationId: 'notif-1' });

      // Should save an attempt at start
      expect(attemptRepo.save).toHaveBeenCalledTimes(1);

      // Should update attempt with failure
      expect(attemptRepo.update).toHaveBeenCalledTimes(1);
      const updatedAttempt = vi.mocked(attemptRepo.update).mock.calls[0][0];
      expect(updatedAttempt.status).toBe('FAILED');
      expect(updatedAttempt.providerError).toBe('Provider timeout');
      expect(updatedAttempt.finishedAt).toBeInstanceOf(Date);
    });

    it('should track correct attempt number on retries', async () => {
      const notification = makeNotification({ retryCount: 2 });
      const template = makeTemplate();

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
      vi.mocked(emailProvider.send).mockRejectedValue(new Error('Provider error'));

      await useCase.execute({ notificationId: 'notif-1' });

      const savedAttempt = vi.mocked(attemptRepo.save).mock.calls[0][0];
      expect(savedAttempt.attemptNumber).toBe(3); // retryCount + 1
    });

    it('should not create attempt row when WhatsApp template is not approved (GAP-002 short-circuit)', async () => {
      const notification = makeNotification({ channel: 'WHATSAPP', recipient: '+5511888888888' });
      const template = makeTemplate({
        channel: 'WHATSAPP',
        subject: null,
        bodyHtml: null,
        whatsappApprovalStatus: 'PENDING',
      });

      vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);

      await useCase.execute({ notificationId: 'notif-1' });

      // WhatsApp approval failure short-circuits before creating an attempt
      expect(attemptRepo.save).not.toHaveBeenCalled();
      expect(attemptRepo.update).not.toHaveBeenCalled();
    });
  });
});
