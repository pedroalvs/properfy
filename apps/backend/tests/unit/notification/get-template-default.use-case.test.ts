import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTemplateDefaultUseCase } from '../../../src/modules/notification/application/use-cases/get-template-default.use-case';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/shared/domain/errors';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

function makePlatformRow(overrides: Partial<ConstructorParameters<typeof NotificationTemplateEntity>[0]> = {}) {
  return new NotificationTemplateEntity({
    id: 'tpl-platform',
    tenantId: null,
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Platform subject',
    bodyHtml: '<p>Platform body</p>',
    bodyText: 'Platform body',
    variablesJson: [],
    isActive: true,
    notificationClass: 'OPERATIONAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('GetTemplateDefaultUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let useCase: GetTemplateDefaultUseCase;

  beforeEach(() => {
    templateRepo = {
      findByTenantCodeChannel: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new GetTemplateDefaultUseCase(templateRepo, new AuthorizationService(auditService));
  });

  // ─── Resolution: "the level above you" ──────────────────────────────────

  it('returns the platform DB row when resetting an agency override', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makePlatformRow());

    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE',
      channel: 'EMAIL',
      tenantId: '11111111-1111-4111-8111-111111111111',
      actor: makeActor(),
    });

    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith(null, 'INSPECTION_NOTICE', 'EMAIL');
    expect(result).toMatchObject({
      source: 'PLATFORM_DEFAULT',
      subject: 'Platform subject',
      body: '<p>Platform body</p>',
    });
  });

  it('falls back to the factory catalog when the platform row is missing', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);

    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE',
      channel: 'EMAIL',
      tenantId: '11111111-1111-4111-8111-111111111111',
      actor: makeActor(),
    });

    expect(result.source).toBe('FACTORY');
    expect(result.body.length).toBeGreaterThan(0);
  });

  it('returns the factory catalog when resetting the platform default itself', async () => {
    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE',
      channel: 'EMAIL',
      actor: makeActor(),
    });

    expect(templateRepo.findByTenantCodeChannel).not.toHaveBeenCalled();
    expect(result.source).toBe('FACTORY');
    expect(result.subject).toBeTruthy();
    expect(result.body).toContain('<');
  });

  // ─── Channel-aware body ─────────────────────────────────────────────────

  it('returns the plain-text body for an SMS factory template, never HTML', async () => {
    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE_SMS',
      channel: 'SMS',
      actor: makeActor(),
    });

    expect(result.source).toBe('FACTORY');
    expect(result.subject).toBeNull();
    expect(result.body).toContain('Properfy:');
    expect(result.body).not.toContain('<p>');
  });

  it('reads an SMS platform row from bodyText, not bodyHtml', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(
      makePlatformRow({
        templateCode: 'INSPECTION_NOTICE_SMS',
        channel: 'SMS',
        subject: null,
        bodyHtml: null,
        bodyText: 'Properfy: stored SMS copy',
      }),
    );

    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE_SMS',
      channel: 'SMS',
      tenantId: '11111111-1111-4111-8111-111111111111',
      actor: makeActor(),
    });

    expect(result.body).toBe('Properfy: stored SMS copy');
  });

  // ─── Authorization ──────────────────────────────────────────────────────

  it('rejects roles that cannot manage templates', async () => {
    await expect(
      useCase.execute({
        templateCode: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects INSP', async () => {
    await expect(
      useCase.execute({
        templateCode: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('pins CL_ADMIN to its own tenant, ignoring a foreign tenantId in the query', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(makePlatformRow());

    const result = await useCase.execute({
      templateCode: 'INSPECTION_NOTICE',
      channel: 'EMAIL',
      tenantId: '99999999-9999-4999-8999-999999999999',
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-own' }),
    });

    // Whatever tenant it resolves to, the answer is the platform default, which
    // is tenant-agnostic — a CL_ADMIN must never read another agency's override.
    expect(templateRepo.findByTenantCodeChannel).toHaveBeenCalledWith(null, 'INSPECTION_NOTICE', 'EMAIL');
    expect(result.source).toBe('PLATFORM_DEFAULT');
  });

  // ─── Input validation ───────────────────────────────────────────────────

  it('rejects an unknown template code', async () => {
    await expect(
      useCase.execute({ templateCode: 'NOT_A_CODE', channel: 'EMAIL', actor: makeActor() }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an invalid channel', async () => {
    await expect(
      useCase.execute({ templateCode: 'INSPECTION_NOTICE', channel: 'PUSH', actor: makeActor() }),
    ).rejects.toThrow(ValidationError);
  });

  it('404s when neither a platform row nor a factory entry exists for the pair', async () => {
    vi.mocked(templateRepo.findByTenantCodeChannel).mockResolvedValue(null);

    // REPORT_READY is a valid code but has no SMS variant in the catalog.
    await expect(
      useCase.execute({
        templateCode: 'REPORT_READY',
        channel: 'SMS',
        tenantId: '11111111-1111-4111-8111-111111111111',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
