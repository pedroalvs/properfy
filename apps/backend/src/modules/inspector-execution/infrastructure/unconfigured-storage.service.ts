import type { IStorageService, SignedUploadUrlResult, HeadObjectResult } from '../domain/storage.service';
import { StorageNotConfiguredError } from '../../../shared/domain/errors';

/**
 * Object storage used when Supabase S3 is not configured (a dev server without
 * the SUPABASE_S3_* vars). Every operation throws instead of the old no-op
 * stub, which handed back a fake `https://stub-storage/...` upload URL and,
 * worse, reported `headObject → { exists: true }`, so the confirm step
 * "succeeded" for a file that was never stored. Staging/production require S3
 * at boot, so this never runs there.
 *
 * Reads (createSignedDownloadUrl) also throw; callers that must stay resilient
 * — GetMe resolving an inspector avatar — catch it and degrade the URL to null.
 */
export class UnconfiguredStorageService implements IStorageService {
  async createSignedUploadUrl(): Promise<SignedUploadUrlResult> {
    throw new StorageNotConfiguredError();
  }

  async headObject(): Promise<HeadObjectResult> {
    throw new StorageNotConfiguredError();
  }

  async createSignedDownloadUrl(): Promise<string> {
    throw new StorageNotConfiguredError();
  }

  async deleteObject(): Promise<void> {
    throw new StorageNotConfiguredError();
  }
}
