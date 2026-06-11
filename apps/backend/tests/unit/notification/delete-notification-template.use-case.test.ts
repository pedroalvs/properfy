import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteNotificationTemplateUseCase } from '../../../src/modules/notification/application/use-cases/delete-notification-template.use-case';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

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
  const now = new Date('2026-06-09T00:00:00.000Z');
  return new NotificationTemplateEntity({
    id: 'override-1',
    tenantId: 'tenant-1',
    templateCode: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    variablesJson: [],
    isActive: true,
    notificationClass: 'OPERATIONAL',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('DeleteNotificationTemplateUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let auditService: AuditService;
  let useCase: DeleteNotificationTemplateUseCase;

  beforeEach(() => {
    templateRepo = {
      findByTenantCodeChannel: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeTemplate()),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    const authorizationService = new AuthorizationService(auditService);
    useCase = new DeleteNotificationTemplateUseCase(templateRepo, authorizationService, auditService);
  });

  it('deletes a tenant override for AM and writes an audit log', async () => {
    await useCase.execute({ templateId: 'override-1', actor: makeActor({ role: 'AM' }) });

    expect(templateRepo.delete).toHaveBeenCalledWith('override-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NOTIFICATION_TEMPLATE_DELETED',
        entityType: 'NOTIFICATION_TEMPLATE',
        entityId: 'override-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('deletes a tenant override for OP', async () => {
    await useCase.execute({ templateId: 'override-1', actor: makeActor({ role: 'OP', tenantId: null }) });

    expect(templateRepo.delete).toHaveBeenCalledWith('override-1');
  });

  it('forbids CL_ADMIN from hard-deleting (they deactivate instead)', async () => {
    await expect(
      useCase.execute({ templateId: 'override-1', actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) }),
    ).rejects.toThrow(ForbiddenError);

    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting a platform default (tenant_id = NULL)', async () => {
    vi.mocked(templateRepo.findById).mockResolvedValue(makeTemplate({ tenantId: null }));

    await expect(
      useCase.execute({ templateId: 'default-1', actor: makeActor({ role: 'AM' }) }),
    ).rejects.toThrow(ValidationError);

    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the template does not exist', async () => {
    vi.mocked(templateRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ templateId: 'missing', actor: makeActor({ role: 'AM' }) }),
    ).rejects.toThrow(NotFoundError);

    expect(templateRepo.delete).not.toHaveBeenCalled();
  });
});
