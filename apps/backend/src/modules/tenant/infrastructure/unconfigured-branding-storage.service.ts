import type { IBrandingStorageService } from '../domain/branding-storage.service';
import { StorageNotConfiguredError } from '../../../shared/domain/errors';

/**
 * Branding storage used when Supabase S3 is not configured (a dev server
 * without the SUPABASE_S3_* vars). Every operation throws instead of the old
 * no-op stub, which returned a fabricated `https://stub-storage/...` URL and
 * let the use case persist it — the upload appeared to succeed but stored
 * nothing. Staging/production require S3 at boot, so this never runs there.
 */
export class UnconfiguredBrandingStorageService implements IBrandingStorageService {
  async upload(): Promise<void> {
    throw new StorageNotConfiguredError();
  }

  async deleteObject(): Promise<void> {
    throw new StorageNotConfiguredError();
  }

  getPublicUrl(): string {
    throw new StorageNotConfiguredError();
  }
}
