import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpsertNotificationTemplateUseCase } from '../../../src/modules/notification/application/use-cases/upsert-notification-template.use-case';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import {
  NotificationForbiddenError,
  ProtectedTemplateClassificationError,
} from '../../../src/modules/notification/domain/notification.errors';
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
      findById: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
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

  it('should allow OP with null tenantId to write platform default (constitution §II)', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);
    const result = await useCase.execute(makeInput({ actor: makeActor({ role: 'OP', tenantId: null }) }));
    expect(result.tenantId).toBeNull();
    expect(templateRepo.upsert).toHaveBeenCalledTimes(1);
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

  it('should call repo.upsert with correct entity (bodyText derived from bodyHtml)', async () => {
    vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

    await useCase.execute(makeInput());

    expect(templateRepo.upsert).toHaveBeenCalledTimes(1);
    const entity = vi.mocked(templateRepo.upsert).mock.calls[0][0];
    expect(entity.templateCode).toBe('INSPECTION_NOTICE');
    expect(entity.channel).toBe('EMAIL');
    // bodyText is now derived from bodyHtml (htmlToText not injected → fallback to bodyHtml)
    expect(entity.bodyText).toBe('<p>Hello {{tenantName}}</p>');
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

  // ─── Feature 018: notification classification (US5) ──────────────────────

  describe('notificationClass (feature 018)', () => {
    it('defaults non-protected templates to OPERATIONAL when class is omitted', async () => {
      vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

      const result = await useCase.execute(makeInput({ templateCode: 'REMINDER_7_DAYS' }));

      expect(result.notificationClass).toBe('OPERATIONAL');
      const entity = vi.mocked(templateRepo.upsert).mock.calls.at(-1)![0];
      expect(entity.notificationClass).toBe('OPERATIONAL');
    });

    it('accepts an explicit OPERATIONAL classification on a non-protected template', async () => {
      vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

      const result = await useCase.execute(
        makeInput({ templateCode: 'REMINDER_5_DAYS', notificationClass: 'OPERATIONAL' }),
      );

      expect(result.notificationClass).toBe('OPERATIONAL');
    });

    it('enforces TRANSACTIONAL classification on protected template codes', async () => {
      vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

      const result = await useCase.execute(
        makeInput({ templateCode: 'INSPECTION_CONFIRMED', notificationClass: 'TRANSACTIONAL' }),
      );

      expect(result.notificationClass).toBe('TRANSACTIONAL');
    });

    it('auto-classifies protected templates as TRANSACTIONAL when class is omitted', async () => {
      vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

      const result = await useCase.execute(makeInput({ templateCode: 'INSPECTION_CANCELLED' }));

      expect(result.notificationClass).toBe('TRANSACTIONAL');
    });

    it('rejects reclassification of a protected template to OPERATIONAL', async () => {
      await expect(
        useCase.execute(
          makeInput({ templateCode: 'INSPECTION_CONFIRMED', notificationClass: 'OPERATIONAL' }),
        ),
      ).rejects.toThrow(ProtectedTemplateClassificationError);
    });

    it('rejects reclassification of a protected template to MARKETING', async () => {
      await expect(
        useCase.execute(
          makeInput({ templateCode: 'INSPECTION_RESCHEDULED', notificationClass: 'MARKETING' }),
        ),
      ).rejects.toThrow(ProtectedTemplateClassificationError);
    });

    it('allows non-protected templates to be freely reclassified', async () => {
      vi.mocked(templateRepo.upsert).mockResolvedValue(undefined);

      const result = await useCase.execute(
        makeInput({ templateCode: 'REMINDER_3_DAYS', notificationClass: 'TRANSACTIONAL' }),
      );

      expect(result.notificationClass).toBe('TRANSACTIONAL');
    });
  });
});
