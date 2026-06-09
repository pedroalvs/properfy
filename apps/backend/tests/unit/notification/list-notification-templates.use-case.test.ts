import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNotificationTemplatesUseCase } from '../../../src/modules/notification/application/use-cases/list-notification-templates.use-case';
import { NotificationTemplateEntity } from '../../../src/modules/notification/domain/notification-template.entity';
import type { INotificationTemplateRepository } from '../../../src/modules/notification/domain/notification-template.repository';
import type { ITemplateImageBindingRepository, TemplateImageBindingData } from '../../../src/modules/notification/domain/template-image-binding.repository';
import type { IEmailAssetRepository, EmailAssetData } from '../../../src/modules/notification/domain/email-asset.repository';
import type { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';

function makeActor(role = 'AM'): AuthContext {
  return { userId: 'user-1', role: role as any, tenantId: null, branchId: null, inspectorId: null };
}

function makeTemplate(id: string, code: string) {
  return new NotificationTemplateEntity({
    id,
    tenantId: null,
    templateCode: code,
    channel: 'EMAIL',
    subject: 'Test Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    variablesJson: [],
    isActive: true,
    notificationClass: 'OPERATIONAL',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  });
}

function makeBinding(templateId: string, assetId: string, key = 'logo'): TemplateImageBindingData {
  return {
    id: `binding-${templateId}`,
    templateId,
    assetId,
    placeholderKey: key,
    altText: 'Logo',
    width: 100,
    height: 50,
    createdAt: new Date('2024-01-01'),
  };
}

function makeAsset(id: string, key = 'logo'): EmailAssetData {
  return {
    id,
    tenantId: null,
    placeholderKey: key,
    storageKey: `email-assets/${key}.png`,
    publicUrl: `https://cdn.example.com/email-assets/${key}.png`,
    originalFilename: `${key}.png`,
    contentType: 'image/png',
    sizeBytes: 12345,
    width: 100,
    height: 50,
    status: 'VERIFIED',
    everSent: false,
    uploadedByUserId: 'user-1',
    createdAt: new Date('2024-01-01'),
  };
}

describe('ListNotificationTemplatesUseCase', () => {
  let templateRepo: INotificationTemplateRepository;
  let bindingRepo: ITemplateImageBindingRepository;
  let assetRepo: IEmailAssetRepository;
  let authorizationService: AuthorizationService;

  beforeEach(() => {
    templateRepo = {
      findAll: vi.fn(),
      findByTenantCodeChannel: vi.fn(),
      upsert: vi.fn(),
    };
    bindingRepo = {
      findByTemplate: vi.fn(),
      findByAsset: vi.fn(),
      upsert: vi.fn(),
      deleteByTemplateAndKey: vi.fn(),
      deleteAllByTemplate: vi.fn(),
    };
    assetRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByPlaceholderKey: vi.fn(),
      findAll: vi.fn(),
      updateStatus: vi.fn(),
      markEverSent: vi.fn(),
      hardDelete: vi.fn(),
    };
    authorizationService = {
      assertRoles: vi.fn(),
      can: vi.fn(),
      assertTenantScope: vi.fn(),
    } as unknown as AuthorizationService;
  });

  it('should return imageBindings with real data from the binding + asset repos', async () => {
    const template = makeTemplate('tpl-1', 'APPOINTMENT_REMINDER');
    const binding = makeBinding('tpl-1', 'asset-1', 'logo');
    const asset = makeAsset('asset-1', 'logo');

    vi.mocked(templateRepo.findAll).mockResolvedValue([template]);
    vi.mocked(bindingRepo.findByTemplate).mockResolvedValue([binding]);
    vi.mocked(assetRepo.findById).mockResolvedValue(asset);

    const useCase = new ListNotificationTemplatesUseCase(
      templateRepo, authorizationService, bindingRepo, assetRepo,
    );
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]!.imageBindings).toHaveLength(1);
    expect(result.data[0]!.imageBindings[0]).toMatchObject({
      id: binding.id,
      placeholderKey: 'logo',
      assetId: 'asset-1',
      publicUrl: asset.publicUrl,
      altText: 'Logo',
      width: 100,
      height: 50,
    });
  });

  it('should return empty imageBindings when no bindings exist', async () => {
    const template = makeTemplate('tpl-2', 'TENANT_INVITATION');

    vi.mocked(templateRepo.findAll).mockResolvedValue([template]);
    vi.mocked(bindingRepo.findByTemplate).mockResolvedValue([]);

    const useCase = new ListNotificationTemplatesUseCase(
      templateRepo, authorizationService, bindingRepo, assetRepo,
    );
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]!.imageBindings).toHaveLength(0);
    expect(assetRepo.findById).not.toHaveBeenCalled();
  });

  it('should skip bindings whose asset is not found', async () => {
    const template = makeTemplate('tpl-3', 'APPOINTMENT_REMINDER');
    const binding = makeBinding('tpl-3', 'missing-asset', 'logo');

    vi.mocked(templateRepo.findAll).mockResolvedValue([template]);
    vi.mocked(bindingRepo.findByTemplate).mockResolvedValue([binding]);
    vi.mocked(assetRepo.findById).mockResolvedValue(null);

    const useCase = new ListNotificationTemplatesUseCase(
      templateRepo, authorizationService, bindingRepo, assetRepo,
    );
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]!.imageBindings).toHaveLength(0);
  });

  it('should return empty imageBindings when optional repos are not injected (backward compat)', async () => {
    const template = makeTemplate('tpl-4', 'APPOINTMENT_REMINDER');
    vi.mocked(templateRepo.findAll).mockResolvedValue([template]);

    // Only required deps (no bindingRepo/assetRepo)
    const useCase = new ListNotificationTemplatesUseCase(templateRepo, authorizationService);
    const result = await useCase.execute({ actor: makeActor('AM') });

    expect(result.data[0]!.imageBindings).toHaveLength(0);
  });
});
