import type { IStorageService, SignedUploadUrlResult, HeadObjectResult } from '../domain/storage.service';

export class StubStorageService implements IStorageService {
  async createSignedUploadUrl(bucket: string, key: string, _ttlSeconds: number): Promise<SignedUploadUrlResult> {
    return {
      url: `https://stub-storage/${bucket}/upload?key=${encodeURIComponent(key)}`,
      storageKey: key,
    };
  }

  async headObject(_bucket: string, _key: string): Promise<HeadObjectResult> {
    return { exists: true, sizeBytes: 1024 };
  }
}
