import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateInspectorPhotoUploadUrlUseCase } from '../../../src/modules/inspector/application/use-cases/generate-inspector-photo-upload-url.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { InspectorNotFoundError } from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';

function makeInspector(
  overrides: Partial<ConstructorParameters<typeof InspectorEntity>[0]> = {},
): InspectorEntity {
  return new InspectorEntity({
    id: INSPECTOR_ID,
    userId: 'user-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: null,
    status: 'ACTIVE',
    paymentSettingsJson: {},
    serviceTypesJson: [],
    clientEligibilityJson: [],
    blockedClientsJson: [],
    fullName: null,
    address: null,
    abn: null,
    dateOfBirth: null,
    insuranceFileKey: null,
    insuranceExpiresAt: null,
    insuranceMetaJson: null,
    policeCheckFileKey: null,
    policeCheckExpiresAt: null,
    policeCheckMetaJson: null,
    photoStorageKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('GenerateInspectorPhotoUploadUrlUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let storageService: IStorageService;
  let auditService: AuditService;
  let useCase: GenerateInspectorPhotoUploadUrlUseCase;

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      findByEmail: vi.fn(),
      findByUserId: vi.fn(),
      linkUserId: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findByRegionId: vi.fn(),
    } as unknown as IInspectorRepository;
    storageService = {
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        url: 'https://storage.example.com/inspector-avatars/signed-upload',
        storageKey: `inspectors/${INSPECTOR_ID}/avatar.jpg`,
      }),
      createSignedDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new GenerateInspectorPhotoUploadUrlUseCase(inspectorRepo, storageService, auditService);
  });

  it('should return presigned upload URL and fixed storage key for AM', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/jpeg',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.uploadUrl).toBe('https://storage.example.com/inspector-avatars/signed-upload');
    expect(result.storageKey).toMatch(/^inspectors\/.+\/avatar\.jpg$/);
    expect(result.expiresAt).toBeDefined();
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should allow OP to generate upload URL', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/png',
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.storageKey).toMatch(/^inspectors\/.+\/avatar\.png$/);
  });

  it('should allow INSP to upload their own photo', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/webp',
      actor: makeActor({ role: 'INSP', inspectorId: INSPECTOR_ID }),
    });

    expect(result.storageKey).toMatch(/^inspectors\/.+\/avatar\.webp$/);
  });

  it('should reject INSP uploading another inspector photo', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        mimeType: 'image/jpeg',
        actor: makeActor({ role: 'INSP', inspectorId: 'other-inspector-id' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        mimeType: 'image/jpeg',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject disallowed MIME types', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        mimeType: 'image/gif',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        mimeType: 'image/jpeg',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should use fixed key (no UUID) so upload replaces previous avatar', async () => {
    vi.mocked(storageService.createSignedUploadUrl).mockResolvedValue({
      url: 'https://example.com/upload',
      storageKey: `inspectors/${INSPECTOR_ID}/avatar.jpg`,
    });

    const result1 = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/jpeg',
      actor: makeActor({ role: 'AM' }),
    });

    const result2 = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/jpeg',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result1.storageKey).toBe(result2.storageKey);
  });

  it('should sign upload with correct content type', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/jpeg',
      actor: makeActor({ role: 'AM' }),
    });

    expect(storageService.createSignedUploadUrl).toHaveBeenCalledWith(
      'inspector-avatars',
      expect.any(String),
      900,
      'image/jpeg',
    );
  });

  it('should audit the presign action', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      mimeType: 'image/jpeg',
      actor: makeActor({ role: 'AM' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.photo_upload_presigned',
        entityType: 'Inspector',
        entityId: INSPECTOR_ID,
      }),
    );
  });
});
