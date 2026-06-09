import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteEmailAssetUseCase } from '../../../src/modules/notification/application/use-cases/delete-email-asset.use-case';
import { ConflictError } from '../../../src/shared/domain/errors';
import type { IEmailAssetRepository, EmailAssetData } from '../../../src/modules/notification/domain/email-asset.repository';
import type { ITemplateImageBindingRepository, TemplateImageBindingData } from '../../../src/modules/notification/domain/template-image-binding.repository';
import type { IEmailAssetStorageService } from '../../../src/modules/notification/domain/email-asset-storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';

function makeActor(): AuthContext {
  return { userId: 'user-1', role: 'AM', tenantId: null, branchId: null, inspectorId: null };
}

function makeAsset(id = 'asset-1'): EmailAssetData {
  return {
    id, tenantId: null, placeholderKey: 'logo', storageKey: 'email-assets/logo.png',
    publicUrl: 'https://cdn.example.com/logo.png', originalFilename: 'logo.png',
    contentType: 'image/png', sizeBytes: 1000, width: 100, height: 50,
    status: 'VERIFIED', everSent: false, uploadedByUserId: 'user-1', createdAt: new Date(),
  };
}

function makeBinding(assetId: string, templateId: string): TemplateImageBindingData {
  return {
    id: `binding-${templateId}`,
    templateId, assetId, placeholderKey: 'logo',
    altText: null, width: null, height: null, createdAt: new Date(),
  };
}

describe('DeleteEmailAssetUseCase — 409 ASSET_IN_USE', () => {
  let emailAssetRepo: IEmailAssetRepository;
  let bindingRepo: ITemplateImageBindingRepository;
  let storageService: IEmailAssetStorageService;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;

  beforeEach(() => {
    emailAssetRepo = {
      create: vi.fn(), findById: vi.fn(), findByPlaceholderKey: vi.fn(),
      findAll: vi.fn(), updateStatus: vi.fn(), markEverSent: vi.fn(), hardDelete: vi.fn(),
    };
    bindingRepo = {
      findByTemplate: vi.fn(), findByAsset: vi.fn(), upsert: vi.fn(),
      deleteByTemplateAndKey: vi.fn(), deleteAllByTemplate: vi.fn(),
    };
    storageService = { upload: vi.fn(), deleteObject: vi.fn(), getPresignedUploadUrl: vi.fn() } as unknown as IEmailAssetStorageService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = { assertRoles: vi.fn(), can: vi.fn(), assertTenantScope: vi.fn() } as unknown as AuthorizationService;
  });

  it('should throw 409 ConflictError with details.usages (templateIds) when asset is in use', async () => {
    vi.mocked(emailAssetRepo.findById).mockResolvedValue(makeAsset());
    vi.mocked(bindingRepo.findByAsset).mockResolvedValue([
      makeBinding('asset-1', 'tpl-aaa'),
      makeBinding('asset-1', 'tpl-bbb'),
      // Same template referenced twice (duplicate bindings edge case)
      makeBinding('asset-1', 'tpl-aaa'),
    ]);

    const useCase = new DeleteEmailAssetUseCase(
      emailAssetRepo, bindingRepo, storageService, auditService, authorizationService,
    );

    let thrown: unknown;
    try {
      await useCase.execute({ assetId: 'asset-1', confirm: true, actor: makeActor() });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictError);
    const err = thrown as ConflictError;
    expect(err.code).toBe('ASSET_IN_USE');
    expect(err.details).toBeDefined();
    const details = err.details as { usages: string[] };
    // Should be unique template IDs only
    expect(details.usages).toHaveLength(2);
    expect(details.usages).toContain('tpl-aaa');
    expect(details.usages).toContain('tpl-bbb');
  });

  it('should succeed (200) when asset is not in use and confirm=true', async () => {
    vi.mocked(emailAssetRepo.findById).mockResolvedValue(makeAsset());
    vi.mocked(bindingRepo.findByAsset).mockResolvedValue([]);
    vi.mocked(storageService.deleteObject).mockResolvedValue(undefined);
    vi.mocked(emailAssetRepo.hardDelete).mockResolvedValue(undefined);

    const useCase = new DeleteEmailAssetUseCase(
      emailAssetRepo, bindingRepo, storageService, auditService, authorizationService,
    );

    const result = await useCase.execute({ assetId: 'asset-1', confirm: true, actor: makeActor() });
    expect(result.id).toBe('asset-1');
  });
});
