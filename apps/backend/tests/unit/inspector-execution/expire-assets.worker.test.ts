import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpireAssetsWorker } from '../../../src/modules/inspector-execution/infrastructure/workers/expire-assets.worker';
import type { IInspectionAssetRepository } from '../../../src/modules/inspector-execution/domain/inspection-asset.repository';
import type { IStorageService } from '../../../src/modules/inspector-execution/domain/storage.service';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';
import type { Logger } from '../../../src/shared/infrastructure/logger';

const APPOINTMENT_ID = 'appt-00000000-0000-0000-0000-000000000001';

function makeAsset(id: string, storageKey: string): InspectionAssetEntity {
  return new InspectionAssetEntity({
    id,
    appointmentId: APPOINTMENT_ID,
    inspectionExecutionId: 'exec-1',
    storageKey,
    mimeType: 'image/jpeg',
    sizeBytes: null,
    kind: 'PHOTO',
    status: 'PENDING',
    uploadedBy: 'user-insp-1',
    uploadExpiresAt: new Date(Date.now() - 1000),
    originalFilename: null,
    createdAt: new Date(),
  });
}

describe('ExpireAssetsWorker', () => {
  let assetRepo: IInspectionAssetRepository;
  let storageService: IStorageService;
  let logger: Logger;
  let worker: ExpireAssetsWorker;

  beforeEach(() => {
    assetRepo = {
      findById: vi.fn(),
      findByExecutionId: vi.fn(),
      findUploadedByExecutionId: vi.fn(),
      findUploadedByAppointmentId: vi.fn(),
      findExpiredPending: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      update: vi.fn(),
    } as unknown as IInspectionAssetRepository;
    storageService = {
      createSignedUploadUrl: vi.fn(),
      createSignedDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    } as unknown as IStorageService;
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
    } as unknown as Logger;
    worker = new ExpireAssetsWorker(assetRepo, storageService, logger);
  });

  it('should return 0 when no expired assets', async () => {
    vi.mocked(assetRepo.findExpiredPending).mockResolvedValue([]);

    const result = await worker.execute();

    expect(result.expiredCount).toBe(0);
    expect(storageService.deleteObject).not.toHaveBeenCalled();
    expect(assetRepo.update).not.toHaveBeenCalled();
  });

  it('should delete S3 objects and mark assets UPLOAD_FAILED', async () => {
    const asset1 = makeAsset('asset-1', 'inspections/tenant-1/appt-1/asset-1.jpg');
    const asset2 = makeAsset('asset-2', 'inspections/tenant-1/appt-1/asset-2.jpg');
    vi.mocked(assetRepo.findExpiredPending).mockResolvedValue([asset1, asset2]);

    const result = await worker.execute();

    expect(result.expiredCount).toBe(2);
    expect(storageService.deleteObject).toHaveBeenCalledTimes(2);
    expect(storageService.deleteObject).toHaveBeenCalledWith('inspection-assets', asset1.storageKey);
    expect(storageService.deleteObject).toHaveBeenCalledWith('inspection-assets', asset2.storageKey);
    expect(assetRepo.update).toHaveBeenCalledTimes(2);
    expect(assetRepo.update).toHaveBeenCalledWith('asset-1', { status: 'UPLOAD_FAILED' });
    expect(assetRepo.update).toHaveBeenCalledWith('asset-2', { status: 'UPLOAD_FAILED' });
  });

  it('should mark asset UPLOAD_FAILED even when S3 deleteObject fails (best-effort)', async () => {
    const asset = makeAsset('asset-1', 'inspections/tenant-1/appt-1/asset-1.jpg');
    vi.mocked(assetRepo.findExpiredPending).mockResolvedValue([asset]);
    vi.mocked(storageService.deleteObject).mockRejectedValue(new Error('S3 connection error'));

    const result = await worker.execute();

    expect(result.expiredCount).toBe(1);
    expect(assetRepo.update).toHaveBeenCalledWith('asset-1', { status: 'UPLOAD_FAILED' });
  });

  it('should log a warning when S3 deleteObject fails', async () => {
    const asset = makeAsset('asset-1', 'inspections/tenant-1/appt-1/asset-1.jpg');
    vi.mocked(assetRepo.findExpiredPending).mockResolvedValue([asset]);
    const s3Error = new Error('Network timeout');
    vi.mocked(storageService.deleteObject).mockRejectedValue(s3Error);

    await worker.execute();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        storageKey: asset.storageKey,
        err: s3Error,
      }),
      expect.any(String),
    );
  });

  it('should log success when S3 delete succeeds', async () => {
    const asset = makeAsset('asset-1', 'inspections/tenant-1/appt-1/asset-1.jpg');
    vi.mocked(assetRepo.findExpiredPending).mockResolvedValue([asset]);

    await worker.execute();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        storageKey: asset.storageKey,
      }),
      expect.any(String),
    );
  });

  it('should process all assets even if one S3 deletion fails', async () => {
    const asset1 = makeAsset('asset-1', 'inspections/tenant-1/appt-1/asset-1.jpg');
    const asset2 = makeAsset('asset-2', 'inspections/tenant-1/appt-1/asset-2.jpg');
    const asset3 = makeAsset('asset-3', 'inspections/tenant-1/appt-1/asset-3.jpg');
    vi.mocked(assetRepo.findExpiredPending).mockResolvedValue([asset1, asset2, asset3]);
    vi.mocked(storageService.deleteObject)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(undefined);

    const result = await worker.execute();

    expect(result.expiredCount).toBe(3);
    expect(assetRepo.update).toHaveBeenCalledTimes(3);
  });

  it('should pass current time to findExpiredPending', async () => {
    const before = Date.now();
    await worker.execute();
    const after = Date.now();

    const callArgs = vi.mocked(assetRepo.findExpiredPending).mock.calls[0]![0]!;
    expect(callArgs.getTime()).toBeGreaterThanOrEqual(before);
    expect(callArgs.getTime()).toBeLessThanOrEqual(after);
  });
});
