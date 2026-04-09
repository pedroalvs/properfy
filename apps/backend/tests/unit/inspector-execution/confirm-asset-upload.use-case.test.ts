import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmAssetUploadUseCase } from '../../../src/modules/inspector-execution/application/use-cases/confirm-asset-upload.use-case';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  AssetNotFoundError,
  AssetUploadExpiredError,
  AssetUploadNotFoundInStorageError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import type { AuthContext } from '@properfy/shared';

const assetRepo = {
  findById: vi.fn(),
  findByExecutionId: vi.fn(),
  findUploadedByExecutionId: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const storageService = {
  createSignedUploadUrl: vi.fn(),
  headObject: vi.fn(),
};

function makeAsset(overrides = {}) {
  return new InspectionAssetEntity({
    id: 'asset-1',
    appointmentId: 'appt-1',
    inspectionExecutionId: 'exec-1',
    storageKey: 'inspections/tenant-1/appt-1/asset-1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: null,
    kind: 'PHOTO',
    status: 'PENDING',
    uploadedBy: 'insp-1',
    uploadExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  });
}

const inspActor: AuthContext = {
  userId: 'insp-1',
  tenantId: 'tenant-1',
  role: 'INSP' as const,
  branchId: null,
  inspectorId: 'insp-1',
};

describe('ConfirmAssetUploadUseCase', () => {
  let useCase: ConfirmAssetUploadUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const authorizationService = new AuthorizationService({ log: vi.fn() } as never);
    useCase = new ConfirmAssetUploadUseCase(assetRepo, storageService, authorizationService);
  });

  it('sets status to UPLOADED and sizeBytes when S3 object found', async () => {
    const asset = makeAsset();
    assetRepo.findById.mockResolvedValue(asset);
    storageService.headObject.mockResolvedValue({ exists: true, sizeBytes: 1024000 });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      assetId: 'asset-1',
      actor: inspActor,
    });

    expect(result.status).toBe('UPLOADED');
    expect(result.sizeBytes).toBe(1024000);
    expect(result.assetId).toBe('asset-1');
    expect(assetRepo.update).toHaveBeenCalledWith('asset-1', {
      status: 'UPLOADED',
      sizeBytes: 1024000,
    });
  });

  it('sets status to UPLOAD_FAILED and throws AssetUploadNotFoundInStorageError when S3 HEAD returns exists=false', async () => {
    const asset = makeAsset();
    assetRepo.findById.mockResolvedValue(asset);
    storageService.headObject.mockResolvedValue({ exists: false, sizeBytes: 0 });

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        assetId: 'asset-1',
        actor: inspActor,
      }),
    ).rejects.toThrow(AssetUploadNotFoundInStorageError);

    expect(assetRepo.update).toHaveBeenCalledWith('asset-1', {
      status: 'UPLOAD_FAILED',
      sizeBytes: null,
    });
  });

  it('throws AssetUploadExpiredError when uploadExpiresAt is in the past', async () => {
    const asset = makeAsset({
      uploadExpiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
    });
    assetRepo.findById.mockResolvedValue(asset);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        assetId: 'asset-1',
        actor: inspActor,
      }),
    ).rejects.toThrow(AssetUploadExpiredError);

    expect(storageService.headObject).not.toHaveBeenCalled();
  });

  it('returns success without storage call when asset is already UPLOADED (idempotent)', async () => {
    const asset = makeAsset({
      status: 'UPLOADED',
      sizeBytes: 512000,
    });
    assetRepo.findById.mockResolvedValue(asset);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      assetId: 'asset-1',
      actor: inspActor,
    });

    expect(result.status).toBe('UPLOADED');
    expect(result.sizeBytes).toBe(512000);
    expect(storageService.headObject).not.toHaveBeenCalled();
    expect(assetRepo.update).not.toHaveBeenCalled();
  });

  it('throws AssetNotFoundError when asset not found', async () => {
    assetRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        assetId: 'nonexistent',
        actor: inspActor,
      }),
    ).rejects.toThrow(AssetNotFoundError);
  });

  it('throws AssetNotFoundError when asset not owned by inspector (uploadedBy mismatch)', async () => {
    const asset = makeAsset({
      uploadedBy: 'other-inspector',
    });
    assetRepo.findById.mockResolvedValue(asset);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        assetId: 'asset-1',
        actor: inspActor,
      }),
    ).rejects.toThrow(AssetNotFoundError);
  });

  it('throws ForbiddenError when actor is not INSP', async () => {
    const nonInspActor: AuthContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'AM' as const,
      branchId: null,
      inspectorId: null,
    };

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        assetId: 'asset-1',
        actor: nonInspActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
