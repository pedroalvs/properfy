import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendTestNotificationUseCase } from '../../../src/modules/notification/application/use-cases/send-test-notification.use-case';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import type { IEmailProvider, ISmsProvider } from '../../../src/modules/notification/domain/providers';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import { SAMPLE_DATA } from '@properfy/shared';
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
    bodyHtml: '<p>Hello {{rentalTenantName}}</p>',
    bodyText: 'Hello {{rentalTenantName}}',
    variablesJson: ['rentalTenantName', 'propertyAddress'],
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
    bodyText: 'Hi {{rentalTenantName}}, inspection on {{scheduledDate}}',
    variablesJson: ['rentalTenantName', 'scheduledDate'],
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
      findById: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
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
      // SMS fails closed without an allowlist, so the default fixture allows
      // the number the SMS tests use; email stays unrestricted (dev behavior).
      { sms: '+61412345678' },
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

  it('OP with null tenantId falls back to platform scope (cross-tenant role)', async () => {
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com', actor: makeActor({ role: 'OP', tenantId: null }) });
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith(null, 'INSPECTION_NOTICE', 'EMAIL');
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
    expect(passedVars).toHaveProperty('rentalTenantName');
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
      { identity: 'inspection' },
    );
  });

  it('sends a system template test with the system email identity', async () => {
    await useCase.execute({ templateCode: 'PASSWORD_RESET', channel: 'EMAIL', recipient: 'test@example.com', actor: makeActor() });
    expect(emailProvider.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { identity: 'system' },
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
    expect(vi.mocked(templateRenderer.render).mock.calls[0][0]).toBe('Hi {{rentalTenantName}}, inspection on {{scheduledDate}}');
  });

  it('SMS path calls smsProvider.send with recipient and rendered bodyText', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi John Smith, inspection on 2026-04-15');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    expect(smsProvider.send).toHaveBeenCalledWith(
      '+61412345678',
      'Hi John Smith, inspection on 2026-04-15',
      expect.objectContaining({
        customRef: 'test-INSPECTION_NOTICE_SMS',
        enableUnicode: false,
        idempotencyKey: expect.stringMatching(/^test-/),
      }),
    );
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

  // ── Agency branding in test email (mirrors real send, not SAMPLE_DATA) ──────

  describe('agency logo/name/phone from tenant settings', () => {
    const tenantRepo = {
      findById: vi.fn(),
    };

    function makeUseCase() {
      const authorizationService = new AuthorizationService(auditService);
      return new SendTestNotificationUseCase(
        templateRepo, templateRenderer, emailProvider, smsProvider, auditService, authorizationService,
        undefined, undefined, tenantRepo,
      );
    }

    beforeEach(() => {
      tenantRepo.findById.mockReset();
    });

    it('overrides agencyLogoUrl/agencyName/agencyPhone with the tenant branding when testing an agency override', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 'tenant-x',
        name: 'Amecrim Realty',
        settingsJson: { logoUrl: 'https://cdn.example.com/amecrim.png', contactPhone: '+61298765432' },
      });
      // INSPECTION_NOTICE declares agencyName/agencyLogoUrl/agencyPhone as optional vars.
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(
        makeTemplate({ tenantId: 'tenant-x' }),
      );
      vi.mocked(templateRenderer.render).mockReset().mockImplementation((_src, v) => JSON.stringify(v));

      await makeUseCase().execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        tenantId: 'tenant-x', actor: makeActor({ role: 'AM' }),
      });

      expect(tenantRepo.findById).toHaveBeenCalledWith('tenant-x');
      const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
      expect(passedVars.agencyLogoUrl).toBe('https://cdn.example.com/amecrim.png');
      expect(passedVars.agencyName).toBe('Amecrim Realty');
      expect(passedVars.agencyPhone).toBe('+61298765432');
      // Never the Properfy sample logo for an agency override.
      expect(passedVars.agencyLogoUrl).not.toBe(SAMPLE_DATA.agencyLogoUrl);
    });

    it('sets agencyLogoUrl to empty when the tenant has no logo (real-send parity → properfy fallback)', async () => {
      tenantRepo.findById.mockResolvedValue({ id: 'tenant-x', name: 'No Logo Co', settingsJson: {} });
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeTemplate({ tenantId: 'tenant-x' }));
      vi.mocked(templateRenderer.render).mockReset().mockImplementation((_src, v) => JSON.stringify(v));

      await makeUseCase().execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        tenantId: 'tenant-x', actor: makeActor({ role: 'AM' }),
      });

      const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
      expect(passedVars.agencyLogoUrl).toBe('');
    });

    it('keeps SAMPLE_DATA branding for a platform template test (tenantId null)', async () => {
      vi.mocked(templateRenderer.render).mockReset().mockImplementation((_src, v) => JSON.stringify(v));
      await makeUseCase().execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        actor: makeActor({ role: 'AM' }),
      });
      expect(tenantRepo.findById).not.toHaveBeenCalled();
      const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
      expect(passedVars.agencyLogoUrl).toBe(SAMPLE_DATA.agencyLogoUrl);
    });
  });

  // ── Explicit tenant scope (input.tenantId) ─────────────────────────────────

  it('AM with input tenantId looks up that tenant scope first', async () => {
    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      tenantId: 'tenant-x', actor: makeActor({ role: 'AM' }),
    });
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenNthCalledWith(1, 'tenant-x', 'INSPECTION_NOTICE', 'EMAIL');
  });

  it('OP with input tenantId targets that tenant, not its own', async () => {
    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      tenantId: 'tenant-x', actor: makeActor({ role: 'OP', tenantId: 'tenant-op' }),
    });
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenNthCalledWith(1, 'tenant-x', 'INSPECTION_NOTICE', 'EMAIL');
  });

  it('CL_ADMIN with a foreign input tenantId is rejected', async () => {
    await expect(
      useCase.execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        tenantId: 'tenant-other', actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  // ── Inactive override parity with real send ───────────────────────────────

  it('inactive tenant override falls back to the platform row (mirrors real send)', async () => {
    const inactive = makeTemplate({ id: 'tpl-inactive', tenantId: 'tenant-x', isActive: false });
    vi.mocked(templateRepo.findByTenantCodeChannel)
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce(makeTemplate());

    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      tenantId: 'tenant-x', actor: makeActor({ role: 'AM' }),
    });

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenNthCalledWith(2, null, 'INSPECTION_NOTICE', 'EMAIL');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'tpl-1' }),
    );
  });

  // ── Draft content path ─────────────────────────────────────────────────────

  describe('draft content', () => {
    const htmlSanitizer = {
      validateForSave: vi.fn().mockReturnValue({ safe: true }),
      sanitizeForRender: vi.fn((html: string) => html),
    };
    const htmlToText = { convert: vi.fn(() => 'text version') };

    beforeEach(() => {
      htmlSanitizer.validateForSave.mockClear().mockReturnValue({ safe: true });
      htmlSanitizer.sanitizeForRender.mockClear();
      const authorizationService = new AuthorizationService(auditService);
      useCase = new SendTestNotificationUseCase(
        templateRepo, templateRenderer, emailProvider, smsProvider, auditService, authorizationService,
        { sms: '+61412345678' },
        { htmlSanitizer, htmlToText },
      );
    });

    it('EMAIL draft renders the draft body/subject instead of the persisted row', async () => {
      vi.mocked(templateRenderer.render).mockReset().mockImplementation((src: string) => `R:${src}`);
      await useCase.execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        draftSubject: 'Draft subject', draftBodyHtml: '<p>Draft body</p>',
        actor: makeActor(),
      });
      const renderedSources = vi.mocked(templateRenderer.render).mock.calls.map((c) => c[0]);
      expect(renderedSources).toContain('Draft subject');
      expect(renderedSources).toContain('<p>Draft body</p>');
      expect(renderedSources).not.toContain('<p>Hello {{rentalTenantName}}</p>');
    });

    it('EMAIL draft body is validated with the save-time HTML rules', async () => {
      await useCase.execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        draftBodyHtml: '<p>Draft body</p>',
        actor: makeActor(),
      });
      expect(htmlSanitizer.validateForSave).toHaveBeenCalledWith('<p>Draft body</p>');
    });

    it('EMAIL draft failing save-time validation throws ValidationError and does not send', async () => {
      htmlSanitizer.validateForSave.mockReturnValue({ safe: false, rejectedReason: 'Disallowed tag: <script>' });
      await expect(
        useCase.execute({
          templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
          draftBodyHtml: '<script>x</script>',
          actor: makeActor(),
        }),
      ).rejects.toThrow(ValidationError);
      expect(emailProvider.send).not.toHaveBeenCalled();
    });

    it('EMAIL draft sends even when no persisted template exists (new override being created)', async () => {
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);
      await useCase.execute({
        templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
        draftSubject: 'S', draftBodyHtml: '<p>B</p>',
        tenantId: 'tenant-x', actor: makeActor(),
      });
      expect(emailProvider.send).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'INSPECTION_NOTICE' }),
      );
    });

    it('SMS draft renders draftBodyText instead of the persisted row', async () => {
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
      vi.mocked(templateRenderer.render).mockReset().mockReturnValue('rendered draft');
      await useCase.execute({
        templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678',
        draftBodyText: 'Draft sms {{rentalTenantName}}',
        actor: makeActor(),
      });
      expect(vi.mocked(templateRenderer.render).mock.calls[0][0]).toBe('Draft sms {{rentalTenantName}}');
      expect(smsProvider.send).toHaveBeenCalledWith('+61412345678', 'rendered draft', expect.anything());
    });
  });

  // ── Recipient allowlists ───────────────────────────────────────────────────

  describe('recipient allowlists', () => {
    beforeEach(() => {
      const authorizationService = new AuthorizationService(auditService);
      useCase = new SendTestNotificationUseCase(
        templateRepo, templateRenderer, emailProvider, smsProvider, auditService, authorizationService,
        { email: 'safe@test.com, other@test.com', sms: '+61400000001,+61400000002' },
      );
    });

    it('EMAIL outside the allowlist is rejected', async () => {
      await expect(
        useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'evil@x.com', actor: makeActor() }),
      ).rejects.toThrow(ForbiddenError);
      expect(emailProvider.send).not.toHaveBeenCalled();
    });

    it('EMAIL inside the allowlist is sent (case-insensitive)', async () => {
      await useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'Safe@Test.com', actor: makeActor() });
      expect(emailProvider.send).toHaveBeenCalled();
    });

    it('SMS outside the allowlist is rejected', async () => {
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
      await expect(
        useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() }),
      ).rejects.toThrow(ForbiddenError);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('SMS inside the allowlist is sent', async () => {
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
      vi.mocked(templateRenderer.render).mockReset().mockReturnValue('Hi');
      await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61400000001', actor: makeActor() });
      expect(smsProvider.send).toHaveBeenCalled();
    });

    it('SMS with NO allowlist configured fails closed', async () => {
      const authorizationService = new AuthorizationService(auditService);
      const noAllowlist = new SendTestNotificationUseCase(
        templateRepo, templateRenderer, emailProvider, smsProvider, auditService, authorizationService,
      );
      vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
      await expect(
        noAllowlist.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() }),
      ).rejects.toThrow(ForbiddenError);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('EMAIL with NO allowlist configured stays unrestricted (dev behavior)', async () => {
      const authorizationService = new AuthorizationService(auditService);
      const noAllowlist = new SendTestNotificationUseCase(
        templateRepo, templateRenderer, emailProvider, smsProvider, auditService, authorizationService,
      );
      await noAllowlist.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'anyone@x.com', actor: makeActor() });
      expect(emailProvider.send).toHaveBeenCalled();
    });
  });

  it('a subject-only draft counts as a draft: inactive override does NOT fall back to platform', async () => {
    const inactive = makeTemplate({ id: 'tpl-inactive', tenantId: 'tenant-x', isActive: false });
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValueOnce(inactive);

    await useCase.execute({
      templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL', recipient: 'a@b.com',
      tenantId: 'tenant-x', draftSubject: 'Draft subject only',
      actor: makeActor({ role: 'AM' }),
    });

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'tpl-inactive' }),
    );
  });

  it('SMS sample vars come from TEMPLATE_VARIABLES[INSPECTION_NOTICE_SMS] (no EMAIL-only leak)', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makeSmsTemplate());
    vi.mocked(templateRenderer.render).mockReset().mockReturnValue('rendered');
    await useCase.execute({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', recipient: '+61412345678', actor: makeActor() });
    const [, passedVars] = vi.mocked(templateRenderer.render).mock.calls[0] as [unknown, Record<string, string>];
    expect(passedVars).toHaveProperty('rentalTenantName');
    expect(passedVars).toHaveProperty('scheduledDate');
    // inspectorName is not in INSPECTION_NOTICE_SMS spec
    expect(passedVars).not.toHaveProperty('inspectorName');
  });
});
