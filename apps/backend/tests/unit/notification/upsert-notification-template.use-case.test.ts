import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpsertNotificationTemplateUseCase } from '../../../src/modules/notification/application/use-cases/upsert-notification-template.use-case';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { NotificationForbiddenError } from '../../../src/modules/notification/domain/notification.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

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

function makeInput(overrides: Partial<Parameters<UpsertNotificationTemplateUseCase['execute']>[0]> = {}) {
  return {
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection for {{propertyAddress}}',
    bodyHtml: '<p>Hello {{tenantName}}</p>',
    bodyText: 'Hello {{tenantName}}, your inspection at {{propertyAddress}} is scheduled.',
    isActive: true,
    actor: makeActor(),
    ...overrides,
  };
}

describe('UpsertNotificationTemplateUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let templateRenderer: TemplateRendererService;
  let auditService: AuditService;
  let useCase: UpsertNotificationTemplateUseCase;

  beforeEach(() => {
    templateRepo = {
      findByTenantCodeChannel: vi.fn(),
      findAll: vi.fn(),
      upsert: vi.fn(),
    };

    templateRenderer = {
      render: vi.fn(),
      extractVariables: vi.fn((template: string) => {
        const matches = template.match(/\{\{(\w+)\}\}/g);
        if (!matches) return [];
        return [...new Set(matches.map((m: string) => m.replace(/\{\{|\}\}/g, '')))];
      }),
    };

    auditService = {
      log: vi.fn(),
    } as unknown as AuditService;

    const authorizationService = new AuthorizationService(auditService);
    useCase = new UpsertNotificationTemplateUseCase(templateRepo, templateRenderer, auditService, authorizationService);
  });

  it('should throw NotificationForbiddenError for OP with null tenantId (platform default)', async () => {
    await expect(
      useCase.execute(makeInput({ actor: makeActor({ role: 'OP', tenantId: null }) })),
    ).rejects.toThrow(NotificationForbiddenError);
  });

  it('should allow OP to upsert template with own tenantId', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    const result = await useCase.execute(
      makeInput({ actor: makeActor({ role: 'OP', tenantId: 'tenant-op-1' }) }),
    );

    expect(result.tenantId).toBe('tenant-op-1');
    expect(templateRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('should throw ForbiddenError for CL_USER role', async () => {
    await expect(
      useCase.execute(makeInput({ actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }) })),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError for INSP role', async () => {
    await expect(
      useCase.execute(makeInput({ actor: makeActor({ role: 'INSP' }) })),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ValidationError for invalid template code', async () => {
    await expect(
      useCase.execute(makeInput({ templateCode: 'INVALID_CODE' })),
    ).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError for invalid channel', async () => {
    await expect(
      useCase.execute(makeInput({ channel: 'PUSH' })),
    ).rejects.toThrow(ValidationError);
  });

  it('should set tenantId to null for AM actor (platform default)', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    const result = await useCase.execute(makeInput({ actor: makeActor({ role: 'AM' }) }));

    expect(result.tenantId).toBeNull();
  });

  it('should set tenantId to actor.tenantId for CL_ADMIN', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    const result = await useCase.execute(
      makeInput({ actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) }),
    );

    expect(result.tenantId).toBe('tenant-1');
  });

  it('should extract variables from bodyText and bodyHtml', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    await useCase.execute(makeInput());

    const upsertCall = vi.mocked(templateRepo.upsert).mock.calls[0][0];
    expect(upsertCall.variablesJson).toContain('tenantName');
    expect(upsertCall.variablesJson).toContain('propertyAddress');
  });

  it('should call repo.upsert with correct entity', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    await useCase.execute(makeInput());

    expect(templateRepo.upsert).toHaveBeenCalledTimes(1);
    const entity = vi.mocked(templateRepo.upsert).mock.calls[0][0];
    expect(entity.templateCode).toBe('INSPECTION_NOTICE');
    expect(entity.channel).toBe('EMAIL');
    expect(entity.bodyText).toBe('Hello {{tenantName}}, your inspection at {{propertyAddress}} is scheduled.');
    expect(entity.active).toBe(true);
    expect(entity.tenantId).toBeNull();
  });

  it('should call audit service log', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    await useCase.execute(makeInput());

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NOTIFICATION_TEMPLATE_UPSERTED',
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'NOTIFICATION_TEMPLATE',
      }),
    );
  });

  it('should return correct output', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    const result = await useCase.execute(makeInput());

    expect(result.id).toBeDefined();
    expect(result.tenantId).toBeNull();
    expect(result.templateCode).toBe('INSPECTION_NOTICE');
    expect(result.channel).toBe('EMAIL');
    expect(result.isActive).toBe(true);
    expect(result.updatedAt).toBeDefined();
  });
});
