import type { IStorageService, SignedUploadUrlResult, HeadObjectResult } from '../domain/storage.service';

export class StubStorageService implements IStorageService {
  async createSignedUploadUrl(bucket: string, key: string, _ttlSeconds: number, _contentType: string): Promise<SignedUploadUrlResult> {
    return {
      url: `https://stub-storage/${bucket}/upload?key=${encodeURIComponent(key)}`,
      storageKey: key,
    };
  }

  async headObject(_bucket: string, _key: string): Promise<HeadObjectResult> {
    return { exists: true, sizeBytes: 1024 };
  }

  async createSignedDownloadUrl(bucket: string, key: string, _ttlSeconds: number): Promise<string> {
    return `https://stub-storage/${bucket}/download?key=${encodeURIComponent(key)}`;
  }

  async deleteObject(_bucket: string, _key: string): Promise<void> {
    // no-op in tests
  }
}
