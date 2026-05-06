import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAppointmentAssetDownloadUrlUseCase } from '../../../src/modules/inspector-execution/application/use-cases/get-appointment-asset-download-url.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { IInspectionAssetRepository } from '../../../src/modules/inspector-execution/domain/inspection-asset.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

const APPOINTMENT_ID = 'appt-00000000-0000-0000-0000-000000000001';
const ASSET_ID = 'asset-00000000-0000-0000-0000-000000000001';
const STORAGE_KEY = `inspections/tenant-1/${APPOINTMENT_ID}/${ASSET_ID}.jpg`;
const SIGNED_URL = 'https://storage.example.com/inspection-assets/signed?sig=xyz';

function makeAsset(
  overrides: Partial<ConstructorParameters<typeof InspectionAssetEntity>[0]> = {},
): InspectionAssetEntity {
  return new InspectionAssetEntity({
    id: ASSET_ID,
    appointmentId: APPOINTMENT_ID,
    inspectionExecutionId: 'exec-1',
    storageKey: STORAGE_KEY,
    mimeType: 'image/jpeg',
    sizeBytes: 204800,
    kind: 'PHOTO',
    status: 'UPLOADED',
    uploadedBy: 'user-insp-1',
    uploadExpiresAt: null,
    originalFilename: 'living_room.jpg',
    createdAt: new Date('2026-01-15T10:00:00Z'),
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

describe('GetAppointmentAssetDownloadUrlUseCase', () => {
  let assetRepo: IInspectionAssetRepository;
  let storageService: IStorageService;
  let authorizationService: AuthorizationService;
  let useCase: GetAppointmentAssetDownloadUrlUseCase;

  beforeEach(() => {
    assetRepo = {
      findById: vi.fn().mockResolvedValue(makeAsset()),
      findByExecutionId: vi.fn(),
      findUploadedByExecutionId: vi.fn(),
      findUploadedByAppointmentId: vi.fn(),
      findExpiredPending: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as IInspectionAssetRepository;
    storageService = {
      createSignedUploadUrl: vi.fn(),
      createSignedDownloadUrl: vi.fn().mockResolvedValue(SIGNED_URL),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
    } as unknown as IStorageService;
    authorizationService = new AuthorizationService({ log: vi.fn() } as never);
    useCase = new GetAppointmentAssetDownloadUrlUseCase(assetRepo, storageService, authorizationService);
  });

  it('should return signed download URL, fileName and mimeType for AM', async () => {
    const result = await useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'AM' }));

    expect(result.downloadUrl).toBe(SIGNED_URL);
    expect(result.fileName).toBe('living_room.jpg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(storageService.createSignedDownloadUrl).toHaveBeenCalledWith(
      'inspection-assets',
      STORAGE_KEY,
      300,
    );
  });

  it('should return signed download URL for OP', async () => {
    const result = await useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'OP', tenantId: 'tenant-1' }));

    expect(result.downloadUrl).toBe(SIGNED_URL);
  });

  it('should return null fileName when originalFilename is null', async () => {
    vi.mocked(assetRepo.findById).mockResolvedValue(makeAsset({ originalFilename: null }));

    const result = await useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'AM' }));

    expect(result.fileName).toBeNull();
  });

  it('should reject CL_ADMIN', async () => {
    await expect(
      useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should reject INSP', async () => {
    await expect(
      useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'INSP', inspectorId: 'insp-1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should throw NotFoundError when asset does not exist', async () => {
    vi.mocked(assetRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'AM' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should throw NotFoundError when asset belongs to different appointment', async () => {
    vi.mocked(assetRepo.findById).mockResolvedValue(
      makeAsset({ appointmentId: 'different-appointment-id' }),
    );

    await expect(
      useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'AM' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should throw NotFoundError when asset is not in UPLOADED status', async () => {
    vi.mocked(assetRepo.findById).mockResolvedValue(makeAsset({ status: 'PENDING' }));

    await expect(
      useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'AM' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should use TTL of 5 minutes (300s)', async () => {
    await useCase.execute(APPOINTMENT_ID, ASSET_ID, makeActor({ role: 'AM' }));

    expect(storageService.createSignedDownloadUrl).toHaveBeenCalledWith(
      'inspection-assets',
      expect.any(String),
      300,
    );
  });
});
