import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendTestNotificationUseCase } from '../../../src/modules/notification/application/use-cases/send-test-notification.use-case';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import type { IEmailProvider, ISmsProvider } from '../../../src/modules/notification/domain/providers';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { TemplateNotFoundError, NotificationForbiddenError } from '../../../src/modules/notification/domain/notification.errors';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<ConstructorParameters<typeof NotificationTemplateEntity>[0]> = {}) {
  return new NotificationTemplateEntity({
    id: 'tpl-1',
    tenantId: null,
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection at {{propertyAddress}}',
    bodyHtml: '<p>Hello {{tenantName}}</p>',
    bodyText: 'Hello {{tenantName}}',
    variablesJson: ['tenantName', 'propertyAddress'],
    isActive: true,
    notificationClass: 'OPERATIONAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeSmsTemplate() {
  return makeTemplate({
    id: 'tpl-sms-1',
    templateCode: 'INSPECTION_NOTICE_SMS',
    channel: 'SMS',
    subject: null,
    bodyHtml: null,
    bodyText: 'Hi {{tenantName}}, inspection on {{scheduledDate}}',
    variablesJson: ['tenantName', 'scheduledDate'],
  });
}

describe('SendTestNotificationUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let templateRenderer: TemplateRendererService;
  let emailProvider: IEmailProvider;
  let smsProvider: ISmsProvider;
  let auditService: AuditService;
  let useCase: SendTestNotificationUseCase;

  beforeEach(() => {
    templateRepo = {
      findByTenantCodeChannel: vi.fn().mockResolvedValue(makeTemplate()),
      findAll: vi.fn(),
      upsert: vi.fn(),
    };

    templateRenderer = {
      render: vi.fn()
        .mockReturnValueOnce('Inspection at 123 Main St, Sydney NSW 2000') // subject
        .mockReturnValueOnce('<p>Hello John Smith</p>')                      // bodyHtml
        .mockReturnValue('Hello John Smith'),                                // bodyText
      extractVariables: vi.fn().mockReturnValue([]),
    } as unknown as TemplateRendererService;

    emailProvider = {
      send: vi.fn().mockResolvedValue({ messageId: 'msg-abc' }),
    };

    smsProvider = {
      send: vi.fn().mockResolvedValue({ messageId: 'sms-msg-xyz' }),
    };

    auditService = { log: vi.fn() } as unknown as AuditService;

    const authorizationService = new AuthorizationService(auditService);
    useCase = new SendTestNotificationUseCase(
      templateRepo,
      templateRenderer,
      emailProvider,
      smsProvider,
      auditService,
      authorizationService,
    );
  });

  // ── Role-based access ──────────────────────────────────────────────────────

  it('rejects INSP with ForbiddenError', async () => {
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor({ role: 'INSP' }) }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects CL_USER with ForbiddenError', async () => {
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }) }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects OP with null tenantId (cannot act as platform scope)', async () => {
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor({ role: 'OP', tenantId: null }) }),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  it('rejects CL_ADMIN with null tenantId with NotificationForbiddenError', async () => {
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor({ role: 'CL_ADMIN', tenantId: null }) }),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  // ── Channel validation ─────────────────────────────────────────────────────

  it('runtime guard rejects unsupported channel string with ValidationError', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'INVALID_CHANNEL' as any, recipient: 'a@b.com', actor: makeActor() }),
    ).rejects.toThrow(ValidationError);
  });

  // ── Template lookup ────────────────────────────────────────────────────────

  it('AM looks up template with tenantId=null', async () => {
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor({ role: 'AM' }) });
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith(null, 'INSPECTION_NOTICE', 'EMAIL');
  });

  it('CL_ADMIN looks up template with actor.tenantId first', async () => {
    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith('tenant-1', 'INSPECTION_NOTICE', 'EMAIL');
  });

  it('falls back to platform-default template when tenant-specific is null', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeTemplate());

    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledTimes(2);
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenNthCalledWith(2, null, 'INSPECTION_NOTICE', 'EMAIL');
  });

  it('throws TemplateNotFoundError when both tenant-specific and platform-default are null', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor() }),
    ).rejects.toThrow(TemplateNotFoundError);
  });

  // ── Rendering and sending (EMAIL) ──────────────────────────────────────────

  it('calls templateRenderer.render with sample vars for each template part', async () => {
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor() });
    expect(templateRenderer.render).toHaveBeenCalled();
    const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
    expect(passedVars).toHaveProperty('tenantName');
    expect(passedVars).toHaveProperty('propertyAddress');
    expect(passedVars).toHaveProperty('scheduledDate');
  });

  it('calls emailProvider.send with rendered subject/html/text and recipient', async () => {
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'test@example.com', actor: makeActor() });
    expect(emailProvider.send).toHaveBeenCalledWith(
      'test@example.com',
      'Inspection at 123 Main St, Sydney NSW 2000',
      '<p>Hello John Smith</p>',
      'Hello John Smith',
    );
  });

  it('returns messageId, recipient and sentAt', async () => {
    const result = await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'test@example.com', actor: makeActor() });
    expect(result.messageId).toBe('msg-abc');
    expect(result.recipient).toBe('test@example.com');
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  // ── Audit log (EMAIL) ──────────────────────────────────────────────────────

  it('emits audit log with templateCode, recipient, messageId, and channel=EMAIL', async () => {
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'test@example.com', actor: makeActor() });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NOTIFICATION_TEMPLATE_TEST_SENT',
        actorId: 'user-1',
        after: expect.objectContaining({
          templateCode: 'INSPECTION_NOTICE',
          channel: 'EMAIL',
          recipient: 'test@example.com',
          messageId: 'msg-abc',
        }),
      }),
    );
  });

  // ── Sample vars scoping ────────────────────────────────────────────────────

  it('sample vars contain only vars from the template spec (no cross-template leak)', async () => {
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor() });
    const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
    expect(passedVars).not.toHaveProperty('userName');
    expect(passedVars).not.toHaveProperty('reportType');
  });

  // ── OP with tenantId ───────────────────────────────────────────────────────

  it('OP with tenantId succeeds and scopes to tenant', async () => {
    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-op' }),
    });
    expect(result.messageId).toBe('msg-abc');
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith('tenant-op', 'INSPECTION_NOTICE', 'EMAIL');
  });

  // ── SMS path ───────────────────────────────────────────────────────────────

  it('accepts channel SMS and does not throw', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() }),
    ).resolves.not.toThrow();
  });

  it('SMS lookup uses channel=SMS in findByTenantCodeChannel', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith(null, 'INSPECTION_NOTICE_SMS', 'SMS');
  });

  it('SMS path renders only bodyText (1 render call, not 3)', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi John Smith, inspection on 2026-04-15');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(templateRenderer.render).toHaveBeenCalledTimes(1);
    expect(vi.mocked(templateRenderer.render).mock.calls[0][0]).toBe('Hi {{tenantName}}, inspection on {{scheduledDate}}');
  });

  it('SMS path calls smsProvider.send with recipient and rendered bodyText', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi John Smith, inspection on 2026-04-15');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(smsProvider.send).toHaveBeenCalledWith('+61412345678', 'Hi John Smith, inspection on 2026-04-15');
  });

  it('SMS path does not call emailProvider.send', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi John Smith, inspection on 2026-04-15');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('SMS audit log has channel=SMS and recipient (not recipientEmail)', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi John Smith');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NOTIFICATION_TEMPLATE_TEST_SENT',
        after: expect.objectContaining({
          channel: 'SMS',
          recipient: '+61412345678',
          messageId: 'sms-msg-xyz',
        }),
      }),
    );
  });

  it('SMS returns { messageId, recipient, sentAt }', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi John Smith');
    const result = await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(result.messageId).toBe('sms-msg-xyz');
    expect(result.recipient).toBe('+61412345678');
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it('SMS template not found in both scopes throws TemplateNotFoundError', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() }),
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('SMS path throws ValidationError when rendered body is empty', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('   ');
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() }),
    ).rejects.toThrow(ValidationError);
    expect(smsProvider.send).not.toHaveBeenCalled();
  });

  it('SMS sample vars come from TEMPLATE_VARIABLES[INSPECTION_NOTICE_SMS] (no EMAIL-only leak)', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('rendered');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
    expect(passedVars).toHaveProperty('tenantName');
    expect(passedVars).toHaveProperty('scheduledDate');
    // inspectorName is not in INSPECTION_NOTICE_SMS spec
    expect(passedVars).not.toHaveProperty('inspectorName');
  });
});
