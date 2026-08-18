import { describe, it, expect } from 'vitest';
import { UnconfiguredBrandingStorageService } from '../../../src/modules/tenant/infrastructure/unconfigured-branding-storage.service';
import { StorageNotConfiguredError } from '../../../src/shared/domain/errors';

describe('UnconfiguredBrandingStorageService', () => {
  const svc = new UnconfiguredBrandingStorageService();

  it('throws StorageNotConfiguredError (503) on upload', async () => {
    await expect(svc.upload('k', Buffer.from(''), 'image/png')).rejects.toBeInstanceOf(
      StorageNotConfiguredError,
    );
    await expect(svc.upload('k', Buffer.from(''), 'image/png')).rejects.toMatchObject({
      statusCode: 503,
      code: 'STORAGE_NOT_CONFIGURED',
    });
  });

  it('throws on getPublicUrl instead of returning a fabricated URL', () => {
    expect(() => svc.getPublicUrl('k')).toThrow(StorageNotConfiguredError);
  });

  it('throws on deleteObject', async () => {
    await expect(svc.deleteObject('k')).rejects.toBeInstanceOf(StorageNotConfiguredError);
  });
});
