import type { IBrandingStorageService } from '../domain/branding-storage.service';

export class StubBrandingStorageService implements IBrandingStorageService {
  async upload(_key: string, _body: Buffer, _contentType: string): Promise<void> {
    // No-op: used when SUPABASE_S3_* env is absent (local dev, unit tests).
  }

  async deleteObject(_key: string): Promise<void> {
    // No-op.
  }

  getPublicUrl(key: string): string {
    return `https://stub-storage/tenant-branding/${key}`;
  }
}
