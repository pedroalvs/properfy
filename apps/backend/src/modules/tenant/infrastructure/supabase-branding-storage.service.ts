import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { IBrandingStorageService } from '../domain/branding-storage.service';

const BUCKET = 'tenant-branding';

export class SupabaseBrandingStorageService implements IBrandingStorageService {
  constructor(
    private readonly s3Client: S3Client,
    private readonly publicUrlBase: string,
  ) {}

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Short-lived: replacing a logo reuses the same key (same extension),
        // so email clients and the Supabase CDN must re-fetch within minutes.
        CacheControl: 'public, max-age=300',
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    // S3 DeleteObject is idempotent — deleting a missing key succeeds.
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  }

  getPublicUrl(key: string): string {
    const base = this.publicUrlBase.replace(/\/$/, '');
    return `${base}/${BUCKET}/${key}`;
  }
}
