import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmInspectorPhotoUploadUseCase } from '../../../src/modules/inspector/application/use-cases/confirm-inspector-photo-upload.use-case';
import type { IInspectorRepository } from '../../../src/modules/inspector/domain/inspector.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { InspectorEntity } from '../../../src/modules/inspector/domain/inspector.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  InspectorNotFoundError,
  InspectorPhotoInvalidKeyError,
  InspectorPhotoObjectNotFoundError,
} from '../../../src/modules/inspector/domain/inspector.errors';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';
const STORAGE_KEY = `inspectors/${INSPECTOR_ID}/avatar.jpg`;

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

describe('ConfirmInspectorPhotoUploadUseCase', () => {
  let inspectorRepo: IInspectorRepository;
  let storageService: IStorageService;
  let auditService: AuditService;
  let useCase: ConfirmInspectorPhotoUploadUseCase;

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
      createSignedUploadUrl: vi.fn(),
      createSignedDownloadUrl: vi.fn(),
      headObject: vi.fn().mockResolvedValue({ exists: true, sizeBytes: 51200 }),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ConfirmInspectorPhotoUploadUseCase(inspectorRepo, storageService, auditService);
  });

  it('should persist photoStorageKey after successful confirm by AM', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
    expect(inspectorRepo.update).toHaveBeenCalledWith(INSPECTOR_ID, {
      photoStorageKey: STORAGE_KEY,
    });
  });

  it('should verify headObject before persisting', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'AM' }),
    });

    expect(storageService.headObject).toHaveBeenCalledWith('inspector-avatars', STORAGE_KEY);
  });

  it('should throw InspectorPhotoObjectNotFoundError when object not in storage', async () => {
    vi.mocked(storageService.headObject).mockResolvedValue({ exists: false });

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        storageKey: STORAGE_KEY,
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorPhotoObjectNotFoundError);

    expect(inspectorRepo.update).not.toHaveBeenCalled();
  });

  it('should throw InspectorPhotoInvalidKeyError for bad key format', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        storageKey: 'wrong/path/photo.jpg',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorPhotoInvalidKeyError);
  });

  it('should throw InspectorPhotoInvalidKeyError for non-UUID in key', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        storageKey: 'inspectors/not-a-uuid/avatar.jpg',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorPhotoInvalidKeyError);
  });

  it('should allow OP to confirm', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'OP' }),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
  });

  it('should allow INSP to confirm their own photo', async () => {
    const result = await useCase.execute({
      inspectorId: INSPECTOR_ID,
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'INSP', inspectorId: INSPECTOR_ID }),
    });

    expect(result.inspectorId).toBe(INSPECTOR_ID);
  });

  it('should reject INSP confirming another inspector photo', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        storageKey: STORAGE_KEY,
        actor: makeActor({ role: 'INSP', inspectorId: 'other-id' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        storageKey: STORAGE_KEY,
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw InspectorNotFoundError when inspector does not exist', async () => {
    vi.mocked(inspectorRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        inspectorId: INSPECTOR_ID,
        storageKey: STORAGE_KEY,
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('should audit the confirm action', async () => {
    await useCase.execute({
      inspectorId: INSPECTOR_ID,
      storageKey: STORAGE_KEY,
      actor: makeActor({ role: 'AM' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.photo_confirmed',
        entityType: 'Inspector',
        entityId: INSPECTOR_ID,
        before: { photoStorageKey: null },
        after: { photoStorageKey: STORAGE_KEY },
      }),
    );
  });
});
