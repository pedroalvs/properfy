import type { IBrandingStorageService, SignedUploadUrlResult, HeadObjectResult } from '../domain/branding-storage.service';

export class StubBrandingStorageService implements IBrandingStorageService {
  async createSignedUploadUrl(key: string, _contentType: string, _ttlSeconds: number): Promise<SignedUploadUrlResult> {
    return {
      url: `https://stub-storage/tenant-branding/upload?key=${encodeURIComponent(key)}`,
      storageKey: key,
    };
  }

  getPublicUrl(key: string): string {
    return `https://stub-storage/tenant-branding/${key}`;
  }

  async headObject(_key: string): Promise<HeadObjectResult> {
    return { exists: true, sizeBytes: 1024 };
  }
}
