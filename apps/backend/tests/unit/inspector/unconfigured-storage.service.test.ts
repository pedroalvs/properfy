import { describe, it, expect } from 'vitest';
import { UnconfiguredStorageService } from '../../../src/modules/inspector-execution/infrastructure/unconfigured-storage.service';
import { StorageNotConfiguredError } from '../../../src/shared/domain/errors';

describe('UnconfiguredStorageService', () => {
  const svc = new UnconfiguredStorageService();

  it('throws on createSignedUploadUrl instead of returning a fake upload URL', async () => {
    await expect(svc.createSignedUploadUrl('b', 'k', 60, 'image/png')).rejects.toBeInstanceOf(
      StorageNotConfiguredError,
    );
  });

  it('throws on headObject instead of falsely reporting exists:true', async () => {
    await expect(svc.headObject('b', 'k')).rejects.toMatchObject({
      statusCode: 503,
      code: 'STORAGE_NOT_CONFIGURED',
    });
  });

  it('throws on createSignedDownloadUrl', async () => {
    await expect(svc.createSignedDownloadUrl('b', 'k', 60)).rejects.toBeInstanceOf(
      StorageNotConfiguredError,
    );
  });

  it('throws on deleteObject', async () => {
    await expect(svc.deleteObject('b', 'k')).rejects.toBeInstanceOf(StorageNotConfiguredError);
  });
});
