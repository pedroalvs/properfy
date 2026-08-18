import type { IBrandingStorageService } from '../domain/branding-storage.service';
import { StorageNotConfiguredError } from '../../../shared/domain/errors';

// Branding needs the public URL base on top of the S3 client, so the message
// names both — the S3-only default would be misleading here.
const BRANDING_STORAGE_MESSAGE =
  'Logo storage is not configured in this environment. Set SUPABASE_S3_* and SUPABASE_STORAGE_PUBLIC_URL to enable uploads.';

/**
 * Branding storage used when Supabase S3 is not configured (a dev server
 * without the SUPABASE_S3_* vars). Every operation throws instead of the old
 * no-op stub, which returned a fabricated `https://stub-storage/...` URL and
 * let the use case persist it — the upload appeared to succeed but stored
 * nothing. Staging/production require S3 at boot, so this never runs there.
 */
export class UnconfiguredBrandingStorageService implements IBrandingStorageService {
  async upload(): Promise<void> {
    throw new StorageNotConfiguredError(BRANDING_STORAGE_MESSAGE);
  }

  async deleteObject(): Promise<void> {
    throw new StorageNotConfiguredError(BRANDING_STORAGE_MESSAGE);
  }

  getPublicUrl(): string {
    throw new StorageNotConfiguredError(BRANDING_STORAGE_MESSAGE);
  }
}
