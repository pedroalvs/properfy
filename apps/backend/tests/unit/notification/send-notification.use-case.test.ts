import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendNotificationUseCase } from '../../../src/modules/notification/application/use-cases/send-notification.use-case';
import type { INotificationRepository } from '../../../src/modules/notification/domain/notification.repository';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import type { INotificationAttemptRepository } from '../../../src/modules/notification/domain/notification-attempt.repository';
import type {
  IEmailProvider,
  ISmsProvider,
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
import {
  MAX_RETRY_COUNT,
  SENSITIVE_PAYLOAD_KEYS,
  REDACTED_PAYLOAD_VALUE,
} from '../../../src/modules/notification/domain/notification.constants';
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
    notificationClass: null,
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: { rentalTenantName: 'John', date: '2026-03-20' },
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
    subject: 'Inspection for {{rentalTenantName}}',
    bodyHtml: '<p>Hello {{rentalTenantName}}, your inspection is on {{date}}</p>',
    bodyText: 'Hello {{rentalTenantName}}, your inspection is on {{date}}',
    variablesJson: ['rentalTenantName', 'date'],
    isActive: true,
    notificationClass: 'OPERATIONAL',
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
    scrubPayload: vi.fn().mockResolvedValue(undefined),
  };
  const templateRepo: INotificationTemplateRepository = {
    findByTenantCodeChannel: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
  const consentRepo: INotificationConsentRepository = {
    findByRecipientChannelTenant: vi.fn().mockResolvedValue(null),
    findByScope: vi.fn().mockResolvedValue(null),
    listByRecipient: vi.fn().mockResolvedValue([]),
    countSkippedForRecipient: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(null),
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
    getStatus: vi.fn().mockResolvedValue(null),
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
  let useCase: SendNotificationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    notificationRepo = sut.notificationRepo;
    templateRepo = sut.templateRepo;
    attemptRepo = sut.attemptRepo;
    emailProvider = sut.emailProvider;
    smsProvider = sut.smsProvider;
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

  it('should mark notification FAILED without throwing when no template found (tenant or default)', async () => {
    // A missing template is a permanent failure: throwing would leave the notification
    // PENDING forever and the retry-poll self-heal would re-enqueue it in an infinite loop.
    const notification = makeNotification();
    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);

    await expect(useCase.execute({ notificationId: 'notif-1' })).resolves.toBeUndefined();

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

    expect(notificationRepo.update).toHaveBeenCalledTimes(1);
    const updated = vi.mocked(notificationRepo.update).mock.calls[0]![0];
    expect(updated.status).toBe('FAILED');
    expect(updated.failureReason).toBe('TEMPLATE_NOT_FOUND');
    expect(updated.failedAt).toBeInstanceOf(Date);

    // No provider call and no attempt record for a permanent config failure
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(attemptRepo.save).not.toHaveBeenCalled();
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

  it('should fall back to platform default when the tenant override is inactive', async () => {
    const notification = makeNotification();
    const inactiveOverride = makeTemplate({
      tenantId: 'tenant-1',
      isActive: false,
      subject: 'Override for {{rentalTenantName}}',
      bodyHtml: '<p>Override {{rentalTenantName}}</p>',
      bodyText: 'Override {{rentalTenantName}}',
    });
    const defaultTemplate = makeTemplate({ tenantId: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel)
      .mockResolvedValueOnce(inactiveOverride) // tenant override exists but inactive
      .mockResolvedValueOnce(defaultTemplate); // platform default
    vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledTimes(2);
    // Renders the PLATFORM DEFAULT, not the inactive override.
    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      'Inspection for John',
      '<p>Hello John, your inspection is on 2026-03-20</p>',
      'Hello John, your inspection is on 2026-03-20',
    );
  });

  it('should use the tenant override when it is active (single lookup)', async () => {
    const notification = makeNotification();
    const activeOverride = makeTemplate({
      tenantId: 'tenant-1',
      isActive: true,
      subject: 'Override for {{rentalTenantName}}',
      bodyHtml: '<p>Override {{rentalTenantName}}</p>',
      bodyText: 'Override {{rentalTenantName}}',
    });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValueOnce(activeOverride);
    vi.mocked(emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledTimes(1);
    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      'Override for John',
      '<p>Override John</p>',
      'Override John',
    );
  });

  it('marks FAILED (not thrown) when override is inactive and no platform default exists', async () => {
    const notification = makeNotification();
    const inactiveOverride = makeTemplate({ tenantId: 'tenant-1', isActive: false });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel)
      .mockResolvedValueOnce(inactiveOverride)
      .mockResolvedValueOnce(null);

    await expect(useCase.execute({ notificationId: 'notif-1' })).resolves.toBeUndefined();

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledTimes(2);
    expect(notification.status).toBe('FAILED');
    expect(notification.failureReason).toBe('TEMPLATE_NOT_FOUND');
    expect(emailProvider.send).not.toHaveBeenCalled();
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

  it('should render template and send SMS via SMS provider with normalized E.164 recipient and send options', async () => {
    const notification = makeNotification({ channel: 'SMS', recipient: '0412 345 678' });
    const template = makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
    vi.mocked(smsProvider.send).mockResolvedValue({ messageId: 'msg-sms-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(smsProvider.send).toHaveBeenCalledWith(
      '+61412345678',
      'Hello John, your inspection is on 2026-03-20',
      { idempotencyKey: 'notif-1-1', customRef: 'notif-1', enableUnicode: false },
    );
  });

  it('should fail SMS immediately with INVALID_RECIPIENT_PHONE for an unnormalizable recipient (no retry)', async () => {
    const notification = makeNotification({ channel: 'SMS', recipient: '+5511999999999' });
    const template = makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);

    await useCase.execute({ notificationId: 'notif-1' });

    expect(smsProvider.send).not.toHaveBeenCalled();
    expect(notificationRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        failureReason: 'INVALID_RECIPIENT_PHONE',
        nextRetryAt: null,
      }),
    );
  });

  it('should fail SMS immediately with EMPTY_SMS_BODY when the rendered body is empty (no retry, no provider call)', async () => {
    const notification = makeNotification({
      channel: 'SMS',
      recipient: '+61412345678',
      payloadJson: {},
    });
    const template = makeTemplate({
      channel: 'SMS',
      subject: null,
      bodyHtml: null,
      bodyText: '{{missingVariable}}',
    });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);

    await useCase.execute({ notificationId: 'notif-1' });

    expect(smsProvider.send).not.toHaveBeenCalled();
    expect(notificationRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        failureReason: 'EMPTY_SMS_BODY',
        nextRetryAt: null,
      }),
    );
  });

  it('should enable unicode when the rendered SMS body contains non-GSM-7 characters', async () => {
    const notification = makeNotification({
      channel: 'SMS',
      recipient: '+61412345678',
      payloadJson: { rentalTenantName: 'João', date: '2026-03-20' },
    });
    const template = makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
    vi.mocked(smsProvider.send).mockResolvedValue({ messageId: 'msg-sms-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    expect(smsProvider.send).toHaveBeenCalledWith(
      '+61412345678',
      'Hello João, your inspection is on 2026-03-20',
      expect.objectContaining({ enableUnicode: true }),
    );
  });

  it('should truncate SMS bodies above the provider hard limit', async () => {
    const notification = makeNotification({
      channel: 'SMS',
      recipient: '+61412345678',
      payloadJson: { rentalTenantName: 'x'.repeat(2000), date: '2026-03-20' },
    });
    const template = makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null });

    vi.mocked(notificationRepo.findById).mockResolvedValue(notification);
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(template);
    vi.mocked(smsProvider.send).mockResolvedValue({ messageId: 'msg-sms-1' });

    await useCase.execute({ notificationId: 'notif-1' });

    const [, body] = vi.mocked(smsProvider.send).mock.calls[0]!;
    expect((body as string).length).toBe(1530);
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
        notificationClass: 'OPERATIONAL',
        optedOut: true,
        optedOutAt: now,
        changeSource: 'operator_override',
        changedAt: now,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(consent);

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SKIPPED_OPT_OUT');
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
        notificationClass: 'OPERATIONAL',
        optedOut: false,
        optedOutAt: null,
        changeSource: null,
        changedAt: null,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });

      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(consent);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
    });

    it('should send notification when no consent record exists', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(null);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
    });
  });

  // Feature 018: classification-aware consent branching
  describe('feature 018: notificationClass branching', () => {
    async function optedOutConsent(notificationClass: 'OPERATIONAL' | 'MARKETING' | 'TRANSACTIONAL') {
      const { NotificationConsentEntity: ConsentClass } = await import(
        '../../../src/modules/notification/domain/notification-consent.entity'
      );
      return new ConsentClass({
        id: 'consent-1',
        recipient: 'user@example.com',
        channel: 'EMAIL' as any,
        tenantId: 'tenant-1',
        notificationClass,
        optedOut: true,
        optedOutAt: now,
        changeSource: 'operator_override',
        changedAt: now,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    it('TRANSACTIONAL bypasses consent even when recipient is opted out', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ notificationClass: 'TRANSACTIONAL', templateCode: 'INSPECTION_CONFIRMED' }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ templateCode: 'INSPECTION_CONFIRMED', notificationClass: 'TRANSACTIONAL' }),
      );
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(await optedOutConsent('OPERATIONAL'));
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalledTimes(1);
      // consentRepo.findByScope is NOT called for TRANSACTIONAL
      expect(sut.consentRepo.findByScope).not.toHaveBeenCalled();
      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SENT');
    });

    it('OPERATIONAL with null class on notification falls back to template class and respects opt-out', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ notificationClass: null }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ notificationClass: 'OPERATIONAL' }),
      );
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(await optedOutConsent('OPERATIONAL'));

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SKIPPED_OPT_OUT');
      expect(updated.failureReason).toBe('CONSENT_OPT_OUT');
      expect(sut.emailProvider.send).not.toHaveBeenCalled();
    });

    it('MARKETING is blocked when no opted-in record exists (Phase 1 dead code)', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ notificationClass: 'MARKETING' }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ notificationClass: 'MARKETING' }),
      );
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(null);

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('SKIPPED_OPT_OUT');
      expect(sut.emailProvider.send).not.toHaveBeenCalled();
    });

    it('MARKETING is allowed when recipient has an explicit opted-in record', async () => {
      const { NotificationConsentEntity: ConsentClass } = await import(
        '../../../src/modules/notification/domain/notification-consent.entity'
      );
      const consent = new ConsentClass({
        id: 'consent-mkt-1',
        recipient: 'user@example.com',
        channel: 'EMAIL' as any,
        tenantId: 'tenant-1',
        notificationClass: 'MARKETING',
        optedOut: false,
        optedOutAt: null,
        changeSource: 're_opt_in',
        changedAt: now,
        changedByUserId: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ notificationClass: 'MARKETING' }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ notificationClass: 'MARKETING' }),
      );
      vi.mocked(sut.consentRepo.findByScope).mockResolvedValue(consent);
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
    });

    it('skips EMAIL sends when the agency has email sending disabled', async () => {
      const sut = makeSut();
      const notification = makeNotification({ channel: 'EMAIL' });
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(notification);
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.getTenantSettings).mockResolvedValue({ emailSendingEnabled: false });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).not.toHaveBeenCalled();
      expect(notification.status).toBe('SKIPPED_OPT_OUT');
      expect(notification.failureReason).toBe('AGENCY_EMAIL_DISABLED');
      expect(sut.notificationRepo.update).toHaveBeenCalled();
    });

    it('still sends EMAIL when emailSendingEnabled is absent (default on)', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification({ channel: 'EMAIL' }));
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.getTenantSettings).mockResolvedValue({});
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.emailProvider.send).toHaveBeenCalled();
    });

    it('still sends SMS even when agency email sending is disabled', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ channel: 'SMS', recipient: '+61412345678' }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ channel: 'SMS', bodyText: 'Hi {{rentalTenantName}}' }),
      );
      vi.mocked(sut.getTenantSettings).mockResolvedValue({ emailSendingEnabled: false });
      vi.mocked(sut.smsProvider.send).mockResolvedValue({ messageId: 'sms-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.smsProvider.send).toHaveBeenCalled();
    });
  });

  // GAP-003: Per-tenant budget / rate limit
  describe('GAP-003: daily budget cap', () => {
    it('should fail with BUDGET_EXCEEDED when email cap is reached', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification({ channel: 'EMAIL' }));
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
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
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null }),
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

  });

  // GAP-004: Variable validation
  describe('GAP-004: strict variables validation', () => {
    it('should log warning when template has missing variables', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ payloadJson: { rentalTenantName: 'John' } }), // missing 'date'
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

  });

  describe('sensitive payload scrubbing', () => {
    it('should scrub sensitive payload keys after a successful EMAIL send', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.notificationRepo.scrubPayload).toHaveBeenCalledWith(
        'notif-1',
        'tenant-1',
        SENSITIVE_PAYLOAD_KEYS,
        REDACTED_PAYLOAD_VALUE,
      );
      // Scrub happens after the SENT status update
      const updateOrder = vi.mocked(sut.notificationRepo.update).mock.invocationCallOrder[0]!;
      const scrubOrder = vi.mocked(sut.notificationRepo.scrubPayload).mock.invocationCallOrder[0]!;
      expect(scrubOrder).toBeGreaterThan(updateOrder);
    });

    it('should scrub sensitive payload keys after a successful SMS send', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ channel: 'SMS', recipient: '0412345678' }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ channel: 'SMS', subject: null, bodyHtml: null }),
      );
      vi.mocked(sut.smsProvider.send).mockResolvedValue({ messageId: 'msg-sms-1' });

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.notificationRepo.scrubPayload).toHaveBeenCalledWith(
        'notif-1',
        'tenant-1',
        SENSITIVE_PAYLOAD_KEYS,
        REDACTED_PAYLOAD_VALUE,
      );
    });

    it('should NOT scrub on a transient provider failure (payload needed for retry)', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockRejectedValue(new Error('Provider timeout'));

      await sut.useCase.execute({ notificationId: 'notif-1' });

      expect(sut.notificationRepo.scrubPayload).not.toHaveBeenCalled();
    });

    it('should NOT scrub when retries are exhausted and the notification goes FAILED', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(
        makeNotification({ retryCount: MAX_RETRY_COUNT - 1 }),
      );
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockRejectedValue(new Error('Provider down'));

      await sut.useCase.execute({ notificationId: 'notif-1' });

      const updated = vi.mocked(sut.notificationRepo.update).mock.calls[0][0];
      expect(updated.status).toBe('FAILED');
      expect(sut.notificationRepo.scrubPayload).not.toHaveBeenCalled();
    });

    it('should swallow and log a scrub failure after a successful send', async () => {
      const sut = makeSut();
      vi.mocked(sut.notificationRepo.findById).mockResolvedValue(makeNotification());
      vi.mocked(sut.templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate());
      vi.mocked(sut.emailProvider.send).mockResolvedValue({ messageId: 'msg-1' });
      vi.mocked(sut.notificationRepo.scrubPayload).mockRejectedValue(new Error('db down'));

      await expect(sut.useCase.execute({ notificationId: 'notif-1' })).resolves.toBeUndefined();

      expect((sut.logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalled();
    });
  });
});
